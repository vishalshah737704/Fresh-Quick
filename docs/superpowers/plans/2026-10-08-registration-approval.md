# Registration approval (piece 1: backend and web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new customer is Pending until the admin approves or rejects them (with a reason); the admin is emailed and sees a Pending count; the customer is emailed the outcome; Zippy answers only signed-in users. Backend and web only.

**Architecture:** `users.approval_status` plus SQL helpers; the Supabase Auth account is created banned and unbanned on approval, so login is refused by the server. A new n8n workflow 11 (fired by DB triggers through `n8n_notify`) fetches ready-made email content from a new internal route and sends it with Gmail. Pure logic lives in import-free modules so `node --test` can load them.

**Tech Stack:** Next.js App Router (TypeScript), Supabase (Postgres, GoTrue admin API), n8n, `node --test`, plain SQL tests rolled back in a transaction.

**Spec:** `docs/superpowers/specs/2026-10-08-registration-approval-design.md`

## Global Constraints

- 2-space indent, ES modules, `async/await`, no new npm packages, no hosted Supabase.
- Pure modules under `lib/` that tests import import NOTHING at runtime (node cannot resolve extensionless imports); inject dependencies instead (see `lib/signup-pipeline.ts`, `lib/review-request-email.ts`). Type-only imports are fine.
- Customer-facing text is exact. Pending popup: `Your registration approval is in progress. We will email you once the admin has reviewed it.` Zippy popup: `I am sorry I cannot respond to you till you register and log in. This is necessary to ensure that only validated people are allowed to use the Application & Chat.`
- Ban length for a pending account: `876000h`. Lift with `ban_duration: "none"`.
- Rejection reason: required, trimmed, 1 to 500 characters, no control characters (tab and newline allowed), no lone UTF-16 surrogates; it appears only in the email, never in the status endpoint.
- No RLS write policy is added; every new function is `security definer`, `set search_path = ''`, executable by `service_role` only.
- Identity for admin routes comes only from `resolveAdmin(tokenFromRequest(request))`. Return allow-listed fields, never row spreads.
- Never read or print `.env.local` values. Never commit secrets. The Gmail sends are LIVE: test emails go only to addresses Vishal owns, one at a time, and ask first. Never stop or restart the `--rm` n8n container; import and publish workflows in the n8n UI.
- Run `npm run build`, `npx tsc --noEmit` and `node --test tests/*.test.mjs` before calling the piece done. A live browser run is mandatory (Task 10).
- Do not start the phone-app pieces here. Piece 1 ships together with piece 2.

## Review Focus

1. **Email casing and whitespace** (`Asha@X.com ` versus `asha@x.com`): lookups lower-case and trim, so a duplicate or rejected user is always found. Pinned in Task 1 (SQL) and Task 4 (status route).
2. **Approve and reject at the same moment, or two admins on one request:** exactly one decision wins; the loser gets 409 and must never leave an approved user banned or a rejected user unbanned. Pinned in Task 1 (SQL) and Task 6 (route logic).
3. **Rejection reason that is hostile or odd** (`<script>`, 501 characters, NUL, a lone surrogate, only spaces): rejected or escaped, never an unescaped email body. Pinned in Task 2.
4. **No admin account has an email, or the admin email lookup fails:** the registration still succeeds, the email route returns 404, nothing blocks the user. Pinned in Task 8.
5. **A signed-in user whose session expired versus a visitor:** the expired session keeps "Please sign in again" and the visitor gets the login popup; the server never serves a visitor chat. Pinned in Task 5 and Task 9.

---

### Task 1: Migration 41 and SQL test

**Files:**
- Create: `supabase/migrations/00000000000041_registration_approval.sql`
- Create: `supabase/tests/registration_approval.sql`

**Interfaces:**
- Produces (SQL, all service-role only):
  - `users.approval_status` (`pending|approved|rejected`, default `approved`), `users.rejection_reason`, `users.reviewed_at`, `users.reviewed_by`.
  - `registration_state_by_email(p_email text) returns table (user_id uuid, role text, approval_status text)`.
  - `decide_registration(p_user_id uuid, p_decision text, p_reason text, p_admin uuid) returns table (user_id uuid)` (zero rows = not pending).
  - `registration_requests(p_view text) returns table (user_id uuid, email text, full_name text, phone text, line1 text, city text, pincode text, created_at timestamptz, approval_status text, rejection_reason text, reviewed_at timestamptz)`; `p_view` is `pending` or `history`.
  - `registration_email_context(p_user_id uuid) returns table (email text, full_name text, phone text, line1 text, line2 text, city text, state text, pincode text, approval_status text, rejection_reason text)`.
  - `registration_admin_emails() returns setof text`.
  - Triggers `n8n_registration_submitted` (insert, pending) and `n8n_registration_decided` (update of approval_status), both posting to `http://host.docker.internal:5678/webhook/foodhub/registration-event`.

- [ ] **Step 1: List the existing policies on `users` (record the result in the commit message)**

Run: `docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select policyname, cmd from pg_policies where schemaname='public' and tablename='users'"`
Expected: read-only policies only. If any insert/update/delete policy shows, stop and report.

- [ ] **Step 2: Write the failing SQL test** `supabase/tests/registration_approval.sql`

```sql
-- Checks migration 41 (registration approval). One transaction, rolled back.
--   docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/registration_approval.sql
begin;

do $$
declare
  cust uuid := gen_random_uuid();
  cust2 uuid := gen_random_uuid();
  adm uuid := gen_random_uuid();
  st text;
  n integer;
  admin_list text[];
  reason_back text;
  reviewer uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (cust, 'Reg-Cust@Example.invalid', 'authenticated', 'authenticated'),
    (cust2, 'reg-cust2@example.invalid', 'authenticated', 'authenticated'),
    (adm, 'reg-admin@example.invalid', 'authenticated', 'authenticated');
  insert into public.users (id, role, full_name) values
    (cust, 'customer', 'Reg Cust'), (cust2, 'customer', 'Reg Cust2'), (adm, 'admin', 'Reg Admin');

  -- 1. default is approved, so existing and staff accounts are unaffected
  select approval_status into st from public.users where id = cust;
  if st <> 'approved' then raise exception 'default should be approved, got %', st; end if;

  -- 2. lookup by email ignores case and surrounding spaces are the caller's job (trimmed in app)
  select approval_status into st from public.registration_state_by_email('reg-cust@EXAMPLE.invalid');
  if st is distinct from 'approved' then raise exception 'case-insensitive lookup failed, got %', st; end if;
  select count(*) into n from public.registration_state_by_email('nobody@example.invalid');
  if n <> 0 then raise exception 'unknown email should return no row'; end if;

  -- 3. approve a pending customer once; the second decision gets nothing (concurrency guard)
  update public.users set approval_status = 'pending' where id = cust;
  select count(*) into n from public.decide_registration(cust, 'approved', null, adm);
  if n <> 1 then raise exception 'first decision should win, got %', n; end if;
  select count(*) into n from public.decide_registration(cust, 'rejected', 'too late', adm);
  if n <> 0 then raise exception 'second decision must return no rows, got %', n; end if;
  select approval_status into st from public.users where id = cust;
  if st <> 'approved' then raise exception 'status should stay approved, got %', st; end if;

  -- 4. reject stores the reason and the reviewer
  update public.users set approval_status = 'pending' where id = cust2;
  select count(*) into n from public.decide_registration(cust2, 'rejected', 'Address unclear', adm);
  if n <> 1 then raise exception 'reject should win, got %', n; end if;
  select rejection_reason, reviewed_by into reason_back, reviewer from public.users where id = cust2;
  if reason_back <> 'Address unclear' or reviewer <> adm then raise exception 'reason or reviewer not stored'; end if;

  -- 5. a rejected row must carry a reason, and a reason may not exceed 500 characters
  begin
    update public.users set approval_status = 'rejected', rejection_reason = null where id = cust;
    raise exception 'rejected without a reason should have failed';
  exception when check_violation then null;
  end;
  begin
    update public.users set approval_status = 'rejected', rejection_reason = repeat('x', 501) where id = cust;
    raise exception '501-character reason should have failed';
  exception when check_violation then null;
  end;

  -- 6. only customers can be decided
  update public.users set approval_status = 'pending' where id = adm;
  select count(*) into n from public.decide_registration(adm, 'approved', null, adm);
  if n <> 0 then raise exception 'a non-customer must not be decided'; end if;
  update public.users set approval_status = 'approved' where id = adm;

  -- 7. a rejected customer can go back to pending (re-register) and the reason clears
  update public.users
    set approval_status = 'pending', rejection_reason = null, reviewed_at = null, reviewed_by = null
    where id = cust2;

  -- 8. lists: cust2 is pending; cust is in history
  select count(*) into n from public.registration_requests('pending') where user_id = cust2;
  if n <> 1 then raise exception 'cust2 should be listed as pending'; end if;
  select count(*) into n from public.registration_requests('history') where user_id = cust;
  if n <> 1 then raise exception 'cust should be listed in history'; end if;
  select count(*) into n from public.registration_requests('pending') where user_id = cust;
  if n <> 0 then raise exception 'cust must not be pending'; end if;

  -- 9. email context and admin emails
  select count(*) into n from public.registration_email_context(cust2) where email = 'reg-cust2@example.invalid';
  if n <> 1 then raise exception 'email context missing'; end if;
  select array_agg(e) into admin_list from public.registration_admin_emails() as e;
  if not ('reg-admin@example.invalid' = any(admin_list)) then raise exception 'admin email missing'; end if;

  -- 10. triggers exist
  select count(*) into n from pg_trigger
    where tgname in ('n8n_registration_submitted', 'n8n_registration_decided') and not tgisinternal;
  if n <> 2 then raise exception 'expected 2 registration triggers, got %', n; end if;
end $$;

rollback;
```

- [ ] **Step 3: Run it to verify it fails**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/registration_approval.sql`
Expected: FAIL (`column "approval_status" of relation "users" does not exist`).

- [ ] **Step 4: Write the migration** `supabase/migrations/00000000000041_registration_approval.sql`

```sql
-- 41: customer registration approval. Existing rows default to 'approved'; only the
-- customer sign-up route writes 'pending'. The Auth ban (set by the app) is what blocks login.
alter table public.users
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column rejection_reason text
    check (rejection_reason is null or char_length(rejection_reason) between 1 and 500),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.users(id) on delete set null,
  add constraint users_rejected_has_reason
    check ((approval_status = 'rejected') = (rejection_reason is not null));

create index users_pending_registrations_idx
  on public.users (created_at) where approval_status = 'pending';

create function public.registration_state_by_email(p_email text)
returns table (user_id uuid, role text, approval_status text)
language sql security definer set search_path = '' stable
as $$
  select u.id, u.role, u.approval_status
  from auth.users au
  join public.users u on u.id = au.id
  where lower(au.email) = lower(p_email)
  limit 1
$$;

create function public.decide_registration(
  p_user_id uuid, p_decision text, p_reason text, p_admin uuid
)
returns table (user_id uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision %', p_decision;
  end if;
  return query
  update public.users u
  set approval_status = p_decision,
      rejection_reason = case when p_decision = 'rejected' then p_reason else null end,
      reviewed_at = now(),
      reviewed_by = p_admin
  where u.id = p_user_id and u.role = 'customer' and u.approval_status = 'pending'
  returning u.id;
end;
$$;

create function public.registration_requests(p_view text)
returns table (
  user_id uuid, email text, full_name text, phone text, line1 text, city text,
  pincode text, created_at timestamptz, approval_status text,
  rejection_reason text, reviewed_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select u.id, au.email::text, u.full_name, u.phone, a.line1, a.city, a.pincode,
         u.created_at, u.approval_status, u.rejection_reason, u.reviewed_at
  from public.users u
  join auth.users au on au.id = u.id
  left join lateral (
    select ad.line1, ad.city, ad.pincode from public.addresses ad
    where ad.user_id = u.id and ad.is_default
    order by ad.created_at desc limit 1
  ) a on true
  where u.role = 'customer'
    and case
      when p_view = 'pending' then u.approval_status = 'pending'
      else u.approval_status in ('approved', 'rejected') and u.reviewed_at is not null
    end
  order by case when p_view = 'pending' then u.created_at end asc,
           u.reviewed_at desc nulls last
  limit 200
$$;

create function public.registration_email_context(p_user_id uuid)
returns table (
  email text, full_name text, phone text, line1 text, line2 text, city text,
  state text, pincode text, approval_status text, rejection_reason text
)
language sql security definer set search_path = '' stable
as $$
  select au.email::text, u.full_name, u.phone, a.line1, a.line2, a.city, a.state,
         a.pincode, u.approval_status, u.rejection_reason
  from public.users u
  join auth.users au on au.id = u.id
  left join lateral (
    select ad.line1, ad.line2, ad.city, ad.state, ad.pincode from public.addresses ad
    where ad.user_id = u.id and ad.is_default
    order by ad.created_at desc limit 1
  ) a on true
  where u.id = p_user_id and u.role = 'customer'
$$;

create function public.registration_admin_emails()
returns setof text
language sql security definer set search_path = '' stable
as $$
  select au.email::text
  from public.users u join auth.users au on au.id = u.id
  where u.role = 'admin' and au.email is not null
$$;

revoke all on function public.registration_state_by_email(text) from public, anon, authenticated;
revoke all on function public.decide_registration(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.registration_requests(text) from public, anon, authenticated;
revoke all on function public.registration_email_context(uuid) from public, anon, authenticated;
revoke all on function public.registration_admin_emails() from public, anon, authenticated;
grant execute on function public.registration_state_by_email(text) to service_role;
grant execute on function public.decide_registration(uuid, text, text, uuid) to service_role;
grant execute on function public.registration_requests(text) to service_role;
grant execute on function public.registration_email_context(uuid) to service_role;
grant execute on function public.registration_admin_emails() to service_role;

create trigger n8n_registration_submitted
  after insert on public.users
  for each row
  when (new.approval_status = 'pending')
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/registration-event');

create trigger n8n_registration_decided
  after update of approval_status on public.users
  for each row
  when (old.approval_status is distinct from new.approval_status)
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/registration-event');
```

- [ ] **Step 5: Apply the migration, run the test, repair the tracker**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/00000000000041_registration_approval.sql`
Then: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/registration_approval.sql`
Expected: both succeed, the test ends with `ROLLBACK`.
Then: `npx supabase migration repair --local --status applied 00000000000041` (same as migrations 33-40).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00000000000041_registration_approval.sql supabase/tests/registration_approval.sql
git commit -m "feat(approval): migration 41, registration status, decision and list functions"
```

---

### Task 2: Pure model and email builder

**Files:**
- Create: `lib/registration-model.ts`
- Create: `lib/registration-email.ts`
- Test: `tests/registration-model.test.mjs`

**Interfaces:**
- Produces from `registration-model.ts`:
  `type ApprovalStatus = "pending" | "approved" | "rejected"`;
  `REJECTION_REASON_MAX = 500`;
  message constants `REGISTRATION_PENDING_POPUP`, `LOGIN_PENDING_MESSAGE`, `LOGIN_REJECTED_MESSAGE`, `ALREADY_PENDING_MESSAGE`, `ALREADY_REGISTERED_MESSAGE`, `ZIPPY_LOGIN_REQUIRED_MESSAGE`;
  `isApprovalStatus(v: unknown): v is ApprovalStatus`;
  `cleanRejectionReason(raw: unknown): { ok: true; value: string } | { ok: false; error: string }`;
  `isBannedLoginError(message: string): boolean`;
  `type RegistrationStatusAnswer = "pending" | "rejected" | "none"`;
  `statusAnswer(row: { role: string; approvalStatus: string } | null): RegistrationStatusAnswer`;
  `loginBlockMessage(answer: RegistrationStatusAnswer): string | null`;
  `isApproved(status: unknown): boolean`.
- Produces from `registration-email.ts`:
  `type RegistrationEmailEvent = "submitted" | "approved" | "rejected"`;
  `buildRegistrationEmail(input: { event; brandName: string; fullName: string; email: string; phone: string; address: string; reason?: string; adminUrl: string; loginUrl: string }): { subject: string; html: string }`.

- [ ] **Step 1: Write the failing tests** `tests/registration-model.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  REGISTRATION_PENDING_POPUP, LOGIN_PENDING_MESSAGE, LOGIN_REJECTED_MESSAGE,
  ZIPPY_LOGIN_REQUIRED_MESSAGE, cleanRejectionReason, isBannedLoginError,
  statusAnswer, loginBlockMessage, isApproved, isApprovalStatus,
} from "../lib/registration-model.ts";
import { buildRegistrationEmail } from "../lib/registration-email.ts";

test("customer-facing messages are exactly the agreed text", () => {
  assert.equal(REGISTRATION_PENDING_POPUP, "Your registration approval is in progress. We will email you once the admin has reviewed it.");
  assert.equal(ZIPPY_LOGIN_REQUIRED_MESSAGE, "I am sorry I cannot respond to you till you register and log in. This is necessary to ensure that only validated people are allowed to use the Application & Chat.");
});

test("cleanRejectionReason trims and accepts normal text, newlines and tabs", () => {
  assert.deepEqual(cleanRejectionReason("  Address unclear \n second line\t ok "), { ok: true, value: "Address unclear \n second line\t ok" });
});

test("cleanRejectionReason rejects empty, over-long, NUL, other control characters and lone surrogates", () => {
  for (const bad of ["", "   ", "x".repeat(501), "a\u0000b", "a\u0007b", "a\ud800b", "a\udc00b", 42, null, undefined]) {
    assert.equal(cleanRejectionReason(bad).ok, false, String(bad));
  }
  assert.equal(cleanRejectionReason("x".repeat(500)).ok, true);
  assert.equal(cleanRejectionReason("emoji 😀 is a valid pair").ok, true);
});

test("isBannedLoginError matches GoTrue's banned message only", () => {
  assert.equal(isBannedLoginError("User is banned"), true);
  assert.equal(isBannedLoginError("user is BANNED until later"), true);
  assert.equal(isBannedLoginError("Invalid login credentials"), false);
});

test("statusAnswer only reveals pending or rejected customers", () => {
  assert.equal(statusAnswer({ role: "customer", approvalStatus: "pending" }), "pending");
  assert.equal(statusAnswer({ role: "customer", approvalStatus: "rejected" }), "rejected");
  assert.equal(statusAnswer({ role: "customer", approvalStatus: "approved" }), "none");
  assert.equal(statusAnswer({ role: "vendor", approvalStatus: "pending" }), "none");
  assert.equal(statusAnswer(null), "none");
});

test("loginBlockMessage maps answers to messages", () => {
  assert.equal(loginBlockMessage("pending"), LOGIN_PENDING_MESSAGE);
  assert.equal(loginBlockMessage("rejected"), LOGIN_REJECTED_MESSAGE);
  assert.equal(loginBlockMessage("none"), null);
});

test("isApproved is strict and isApprovalStatus validates", () => {
  assert.equal(isApproved("approved"), true);
  for (const v of ["pending", "rejected", "", null, undefined, "APPROVED"]) assert.equal(isApproved(v), false, String(v));
  assert.equal(isApprovalStatus("pending"), true);
  assert.equal(isApprovalStatus("x"), false);
});

const base = {
  brandName: "Fresh & Quick", fullName: "Asha <b>Rao</b>", email: "a@b.co", phone: "+919820012345",
  address: "12 Linking Rd, Mumbai 400050", adminUrl: "https://app.example.com/admin/registrations",
  loginUrl: "https://app.example.com/customer/login",
};

test("submitted email goes to the admin, escapes applicant text and links to the admin page", () => {
  const { subject, html } = buildRegistrationEmail({ ...base, event: "submitted" });
  assert.match(subject, /^New registration awaiting approval: /);
  assert.ok(!html.includes("<b>Rao</b>"));
  assert.match(html, /Asha &lt;b&gt;Rao&lt;\/b&gt;/);
  assert.match(html, /href="https:\/\/app\.example\.com\/admin\/registrations"/);
  assert.match(html, /\+919820012345/);
});

test("approved email has the login link and no reason", () => {
  const { subject, html } = buildRegistrationEmail({ ...base, event: "approved" });
  assert.match(subject, /approved/i);
  assert.match(html, /href="https:\/\/app\.example\.com\/customer\/login"/);
  assert.match(html, /email and password you chose/i);
});

test("rejected email shows the escaped reason and says the person may register again", () => {
  const { subject, html } = buildRegistrationEmail({ ...base, event: "rejected", reason: "<script>alert(1)</script> Address unclear" });
  assert.match(subject, /not approved/i);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /register again/i);
});

test("subjects drop line breaks and unsafe links are not rendered as links", () => {
  const { subject } = buildRegistrationEmail({ ...base, fullName: "A\r\nBcc: x@evil", event: "submitted" });
  assert.ok(!/[\r\n]/.test(subject));
  const { html } = buildRegistrationEmail({ ...base, adminUrl: "javascript:alert(1)", event: "submitted" });
  assert.ok(!html.includes("javascript:"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/registration-model.test.mjs`
Expected: FAIL (`Cannot find module '../lib/registration-model.ts'`).

- [ ] **Step 3: Write `lib/registration-model.ts`** (no imports)

```ts
// Shared rules and wording for customer registration approval. Imports nothing at runtime so
// `node --test` can load it; the phone app gets a byte-identical copy in piece 2.
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type RegistrationStatusAnswer = "pending" | "rejected" | "none";

export const REJECTION_REASON_MAX = 500;

export const REGISTRATION_PENDING_POPUP =
  "Your registration approval is in progress. We will email you once the admin has reviewed it.";
export const LOGIN_PENDING_MESSAGE = "Your registration is still awaiting admin approval.";
export const LOGIN_REJECTED_MESSAGE =
  "Your registration was rejected. Please check your email for the reason.";
export const ALREADY_PENDING_MESSAGE = "Your registration is already awaiting approval.";
export const ALREADY_REGISTERED_MESSAGE =
  "An account with this email already exists. Please log in.";
export const ZIPPY_LOGIN_REQUIRED_MESSAGE =
  "I am sorry I cannot respond to you till you register and log in. This is necessary to ensure that only validated people are allowed to use the Application & Chat.";

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

export function isApproved(status: unknown): boolean {
  return status === "approved";
}

// Tab (\t) and newline (\n) are allowed; every other control character is not. A Postgres text
// column rejects NUL and a lone UTF-16 surrogate with an error that would surface as a 500.
const BAD_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export function cleanRejectionReason(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "A reason is required" };
  const value = raw.trim();
  if (value === "") return { ok: false, error: "A reason is required" };
  if (value.length > REJECTION_REASON_MAX) {
    return { ok: false, error: `The reason must be ${REJECTION_REASON_MAX} characters or fewer` };
  }
  if (BAD_CONTROL.test(value) || LONE_SURROGATE.test(value)) {
    return { ok: false, error: "The reason contains characters that are not allowed" };
  }
  return { ok: true, value };
}

export function isBannedLoginError(message: string): boolean {
  return /banned/i.test(message);
}

export function statusAnswer(
  row: { role: string; approvalStatus: string } | null
): RegistrationStatusAnswer {
  if (!row || row.role !== "customer") return "none";
  if (row.approvalStatus === "pending") return "pending";
  if (row.approvalStatus === "rejected") return "rejected";
  return "none";
}

export function loginBlockMessage(answer: RegistrationStatusAnswer): string | null {
  if (answer === "pending") return LOGIN_PENDING_MESSAGE;
  if (answer === "rejected") return LOGIN_REJECTED_MESSAGE;
  return null;
}
```

- [ ] **Step 4: Write `lib/registration-email.ts`** (no imports)

```ts
// Builds the three registration emails n8n sends. Imports nothing at runtime (escapeHtml is a small
// copy of the one in lib/delivered-email.ts).
export type RegistrationEmailEvent = "submitted" | "approved" | "rejected";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHttp(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

function button(url: string, label: string): string {
  if (!isHttp(url)) return "";
  return `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#f58220;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:bold;">${escapeHtml(label)}</a></p>`;
}

export function buildRegistrationEmail(input: {
  event: RegistrationEmailEvent;
  brandName: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  reason?: string;
  adminUrl: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const name = escapeHtml(input.fullName);
  const brand = escapeHtml(input.brandName);
  const wrap = (body: string) =>
    `<div style="${FONT}color:#13294b;max-width:560px;word-break:break-word;overflow-wrap:anywhere;">${body}</div>`;

  if (input.event === "submitted") {
    return {
      subject: `New registration awaiting approval: ${oneLine(input.fullName)}`,
      html: wrap(
        `<h2>New registration awaiting approval</h2>` +
          `<p>A customer is asking to register on ${brand}.</p>` +
          `<table cellpadding="4" style="${FONT}">` +
          `<tr><td><b>Name</b></td><td>${name}</td></tr>` +
          `<tr><td><b>Email</b></td><td>${escapeHtml(input.email)}</td></tr>` +
          `<tr><td><b>Phone</b></td><td>${escapeHtml(input.phone)}</td></tr>` +
          `<tr><td><b>Address</b></td><td>${escapeHtml(input.address)}</td></tr></table>` +
          `<p>Log in to the admin portal to approve or reject this request.</p>` +
          button(input.adminUrl, "Open registrations")
      ),
    };
  }
  if (input.event === "approved") {
    return {
      subject: `Your ${oneLine(input.brandName)} registration is approved`,
      html: wrap(
        `<h2>You're approved</h2>` +
          `<p>Hi ${name}, your registration on ${brand} has been approved.</p>` +
          `<p>You can now log in with the email and password you chose when you registered.</p>` +
          button(input.loginUrl, "Log in")
      ),
    };
  }
  return {
    subject: `Your ${oneLine(input.brandName)} registration was not approved`,
    html: wrap(
      `<h2>Registration not approved</h2>` +
        `<p>Hi ${name}, we could not approve your registration on ${brand}.</p>` +
        `<p><b>Reason:</b> ${escapeHtml(input.reason ?? "")}</p>` +
        `<p>You can register again with corrected details.</p>`
    ),
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/registration-model.test.mjs`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/registration-model.ts lib/registration-email.ts tests/registration-model.test.mjs
git commit -m "feat(approval): shared registration model, reason cleaner and email builder"
```

---

### Task 3: Sign-up pipeline, route and tests

**Files:**
- Modify: `lib/signup-pipeline.ts`
- Modify: `app/api/auth/signup/route.ts`
- Modify: `tests/signup-geocode.test.mjs` (`makeDeps`, the success assertion)
- Test: `tests/registration-signup.test.mjs`

**Interfaces:**
- Consumes: message constants from `lib/registration-model.ts` (route only), RPC `registration_state_by_email`.
- Produces: `SignupDeps` gains `lookupByEmail(email: string): Promise<EmailState>` and `reRegister(row: ReRegisterRow): Promise<string | null>`; `messages` gains `alreadyPending` and `alreadyRegistered`; `SignupOutcome.body` success is `{ ok: true; status: "pending" }`. Exported types `EmailState`, `ReRegisterRow`.

- [ ] **Step 1: Write the failing tests** `tests/registration-signup.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { runSignup } from "../lib/signup-pipeline.ts";
import { validateSignupPayload } from "../lib/signup-validation.ts";
import { normalizeIndianMobile } from "../lib/phone.ts";
import { buildSavedLabel } from "../lib/geocode-parse.ts";

const address = { line1: "12 Linking Rd", line2: "", city: "Mumbai", state: "Maharashtra", pincode: "400050" };
const body = { email: "Asha@B.co", password: "secret1", fullName: "Asha Rao", phone: "98200 12345", address };

function makeDeps(lookup, overrides = {}) {
  const calls = { created: [], reRegistered: [], profile: [], addr: [], deleted: [], geocoded: 0 };
  const deps = {
    validate: (b) => validateSignupPayload(b, normalizeIndianMobile),
    geocode: async () => { calls.geocoded += 1; return { kind: "found", lat: 19.06, lng: 72.83 }; },
    buildLabel: buildSavedLabel,
    messages: { notFound: "nf", unavailable: "un", alreadyPending: "PENDING", alreadyRegistered: "REGISTERED" },
    lookupByEmail: async () => lookup,
    reRegister: async (row) => { calls.reRegistered.push(row); return null; },
    createAuthUser: async (email) => { calls.created.push(email); return { id: "u1" }; },
    insertProfile: async (row) => { calls.profile.push(row); return null; },
    insertAddress: async (row) => { calls.addr.push(row); return null; },
    deleteAuthUser: async (id) => { calls.deleted.push(id); },
    ...overrides,
  };
  return { deps, calls };
}

test("new email: account created, outcome is pending, no login implied", async () => {
  const { deps, calls } = makeDeps({ kind: "none" });
  assert.deepEqual(await runSignup(body, deps), { status: 200, body: { ok: true, status: "pending" } });
  assert.equal(calls.created.length, 1);
  assert.equal(calls.reRegistered.length, 0);
});

test("the lookup receives the trimmed, lower-cased email", async () => {
  let seen;
  const { deps } = makeDeps({ kind: "none" }, { lookupByEmail: async (e) => { seen = e; return { kind: "none" }; } });
  await runSignup({ ...body, email: "  Asha@B.co " }, deps);
  assert.equal(seen, "asha@b.co");
});

test("pending customer: 409 already pending, nothing created", async () => {
  const { deps, calls } = makeDeps({ kind: "found", userId: "u9", role: "customer", approvalStatus: "pending" });
  assert.deepEqual(await runSignup(body, deps), { status: 409, body: { error: "PENDING" } });
  assert.equal(calls.created.length + calls.reRegistered.length, 0);
});

test("approved customer and any non-customer role: 409 already registered", async () => {
  for (const found of [
    { kind: "found", userId: "u9", role: "customer", approvalStatus: "approved" },
    { kind: "found", userId: "u9", role: "vendor", approvalStatus: "rejected" },
    { kind: "found", userId: "u9", role: "admin", approvalStatus: "pending" },
  ]) {
    const { deps, calls } = makeDeps(found);
    assert.deepEqual(await runSignup(body, deps), { status: 409, body: { error: "REGISTERED" } });
    assert.equal(calls.created.length + calls.reRegistered.length, 0);
  }
});

test("rejected customer re-registers: details replaced, outcome pending, no new auth user", async () => {
  const { deps, calls } = makeDeps({ kind: "found", userId: "u9", role: "customer", approvalStatus: "rejected" });
  assert.deepEqual(await runSignup(body, deps), { status: 200, body: { ok: true, status: "pending" } });
  assert.equal(calls.created.length, 0);
  assert.equal(calls.reRegistered.length, 1);
  const row = calls.reRegistered[0];
  assert.equal(row.userId, "u9");
  assert.equal(row.password, "secret1");
  assert.equal(row.phone, "+919820012345");
  assert.equal(row.lat, 19.06);
});

test("re-register failure is a 500 with the generic message", async () => {
  const { deps } = makeDeps({ kind: "found", userId: "u9", role: "customer", approvalStatus: "rejected" }, { reRegister: async () => "failed" });
  assert.deepEqual(await runSignup(body, deps), { status: 500, body: { error: "Failed to create account" } });
});

test("geocoding still runs before the duplicate checks, so a bad address never reaches a lookup", async () => {
  let looked = false;
  const { deps } = makeDeps({ kind: "none" }, { geocode: async () => ({ kind: "not_found" }), lookupByEmail: async () => { looked = true; return { kind: "none" }; } });
  assert.equal((await runSignup(body, deps)).status, 400);
  assert.equal(looked, false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/registration-signup.test.mjs`
Expected: FAIL (the pipeline has no `lookupByEmail`, outcome shape differs).

- [ ] **Step 3: Update `lib/signup-pipeline.ts`**

Replace the type block and function with:

```ts
import type { GeocodeAddress, GeocodeResult } from "./geocode-parse";
import type { SignupPayload } from "./signup-validation";

// Pure, dependency-injected sign-up pipeline so every failure path is testable under node's test runner.
// The route supplies the real validator, geocoder and Supabase calls.
export type EmailState =
  | { kind: "none" }
  | { kind: "found"; userId: string; role: string; approvalStatus: string };

export type ReRegisterRow = {
  userId: string;
  password: string;
  fullName: string;
  phone: string;
  lat: number;
  lng: number;
  label: string;
  address: GeocodeAddress;
};

export type SignupDeps = {
  validate(body: Record<string, unknown>):
    | { ok: true; value: SignupPayload }
    | { ok: false; error: string };
  geocode(address: GeocodeAddress): Promise<GeocodeResult>;
  buildLabel(address: GeocodeAddress): string;
  messages: { notFound: string; unavailable: string; alreadyPending: string; alreadyRegistered: string };
  lookupByEmail(email: string): Promise<EmailState>;
  reRegister(row: ReRegisterRow): Promise<string | null>;
  createAuthUser(email: string, password: string): Promise<{ id: string } | { error: string }>;
  insertProfile(row: {
    id: string;
    fullName: string;
    phone: string;
    lat: number;
    lng: number;
    label: string;
  }): Promise<string | null>;
  insertAddress(row: {
    userId: string;
    address: GeocodeAddress;
    lat: number;
    lng: number;
  }): Promise<string | null>;
  deleteAuthUser(id: string): Promise<void>;
};

export type SignupOutcome = {
  status: number;
  body: { ok: true; status: "pending" } | { error: string };
};

export async function runSignup(
  body: Record<string, unknown>,
  deps: SignupDeps
): Promise<SignupOutcome> {
  const parsed = deps.validate(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const { password, fullName, phone, address } = parsed.value;
  const email = parsed.value.email.trim().toLowerCase();

  // Geocode BEFORE creating anything, so a bad address or a provider outage leaves no account behind.
  const geo = await deps.geocode(address);
  if (geo.kind === "not_found") return { status: 400, body: { error: deps.messages.notFound } };
  if (geo.kind === "unavailable") {
    return { status: 503, body: { error: deps.messages.unavailable } };
  }

  const existing = await deps.lookupByEmail(email);
  if (existing.kind === "found") {
    if (existing.role !== "customer" || existing.approvalStatus === "approved") {
      return { status: 409, body: { error: deps.messages.alreadyRegistered } };
    }
    if (existing.approvalStatus === "pending") {
      return { status: 409, body: { error: deps.messages.alreadyPending } };
    }
    // A rejected customer never held an order, wallet or favorites, so replacing the record loses nothing.
    const reError = await deps.reRegister({
      userId: existing.userId,
      password,
      fullName,
      phone,
      lat: geo.lat,
      lng: geo.lng,
      label: deps.buildLabel(address),
      address,
    });
    if (reError) return { status: 500, body: { error: "Failed to create account" } };
    return { status: 200, body: { ok: true, status: "pending" } };
  }

  const created = await deps.createAuthUser(email, password);
  if ("error" in created) return { status: 400, body: { error: created.error } };

  try {
    const profileError = await deps.insertProfile({
      id: created.id,
      fullName,
      phone,
      lat: geo.lat,
      lng: geo.lng,
      label: deps.buildLabel(address),
    });
    if (profileError) throw new Error("profile");
    const addressError = await deps.insertAddress({
      userId: created.id,
      address,
      lat: geo.lat,
      lng: geo.lng,
    });
    if (addressError) throw new Error("address");
  } catch {
    // Deleting the auth user cascades users/addresses.
    try {
      await deps.deleteAuthUser(created.id);
    } catch {
      // Nothing more to do; surfaced as the 500 below.
    }
    return { status: 500, body: { error: "Failed to create account" } };
  }
  return { status: 200, body: { ok: true, status: "pending" } };
}
```

- [ ] **Step 4: Update the existing test helper in `tests/signup-geocode.test.mjs`**

In `makeDeps` change `messages` and add the two new deps, and change the success assertion:

```js
    messages: { notFound: GEOCODE_NOT_FOUND_MESSAGE, unavailable: GEOCODE_UNAVAILABLE_MESSAGE, alreadyPending: "pending", alreadyRegistered: "registered" },
    lookupByEmail: async () => ({ kind: "none" }),
    reRegister: async () => null,
```
and
```js
  assert.deepEqual(out, { status: 200, body: { ok: true, status: "pending" } });
```
(the line currently reading `assert.deepEqual(out, { status: 200, body: { ok: true } });`).

- [ ] **Step 5: Update `app/api/auth/signup/route.ts`**

Add the import at the top (after the existing imports):

```ts
import { ALREADY_PENDING_MESSAGE, ALREADY_REGISTERED_MESSAGE } from "@/lib/registration-model";
```

Change the `messages` line to:

```ts
    messages: {
      notFound: GEOCODE_NOT_FOUND_MESSAGE,
      unavailable: GEOCODE_UNAVAILABLE_MESSAGE,
      alreadyPending: ALREADY_PENDING_MESSAGE,
      alreadyRegistered: ALREADY_REGISTERED_MESSAGE,
    },
    async lookupByEmail(email) {
      const { data, error } = await supabaseServer.rpc("registration_state_by_email", { p_email: email });
      if (error) throw new Error("lookup failed");
      const row = Array.isArray(data) ? data[0] : null;
      return row
        ? { kind: "found", userId: row.user_id, role: row.role, approvalStatus: row.approval_status }
        : { kind: "none" };
    },
    async reRegister(row) {
      // Replace the address first and flip the status LAST, so a failure leaves the request rejected.
      const { error: delError } = await supabaseServer.from("addresses").delete().eq("user_id", row.userId);
      if (delError) return "failed";
      const { error: addrError } = await supabaseServer.from("addresses").insert({
        user_id: row.userId,
        label: "Home",
        line1: row.address.line1,
        line2: row.address.line2 || null,
        city: row.address.city,
        state: row.address.state,
        pincode: row.address.pincode,
        lat: row.lat,
        lng: row.lng,
        is_default: true,
      });
      if (addrError) return "failed";
      const { error: authError } = await supabaseServer.auth.admin.updateUserById(row.userId, {
        password: row.password,
      });
      if (authError) return "failed";
      const { error: profileError } = await supabaseServer
        .from("users")
        .update({
          full_name: row.fullName,
          phone: row.phone,
          saved_lat: row.lat,
          saved_lng: row.lng,
          saved_label: row.label,
          approval_status: "pending",
          rejection_reason: null,
          reviewed_at: null,
          reviewed_by: null,
        })
        .eq("id", row.userId)
        .eq("approval_status", "rejected");
      return profileError ? "failed" : null;
    },
```

In `createAuthUser`, add the ban:

```ts
      const { data, error } = await supabaseServer.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        ban_duration: "876000h",
      });
```

In `insertProfile`, add `approval_status: "pending",` after `role: "customer",`.

Wrap the `runSignup` call so a thrown lookup becomes a 500 (find `const outcome = await runSignup(body, {` and the matching close); replace `const outcome = await runSignup(body, {` with `let outcome;\n  try {\n    outcome = await runSignup(body, {` and the closing `});` with `});\n  } catch {\n    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });\n  }` (re-indent the object inside by two spaces).

- [ ] **Step 6: Run the tests and type-check**

Run: `node --test tests/registration-signup.test.mjs tests/signup-geocode.test.mjs`
Then: `npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/signup-pipeline.ts app/api/auth/signup/route.ts tests/signup-geocode.test.mjs tests/registration-signup.test.mjs
git commit -m "feat(approval): sign-up creates a pending, banned account; rejected emails can re-register"
```

---

### Task 4: Status endpoint, login messages and the pending popup (web)

**Files:**
- Create: `app/api/auth/registration-status/route.ts`
- Modify: `app/customer/login/page.tsx`
- Test: `tests/registration-status.test.mjs` (pure helper `ipBucket`)
- Create: `lib/registration-status-bucket.ts`

**Interfaces:**
- Consumes: `statusAnswer`, `isBannedLoginError`, `loginBlockMessage`, `REGISTRATION_PENDING_POPUP` (Task 2); RPC `registration_state_by_email` (Task 1); `zippy_hit` RPC; `clientIpFromForwarded`, `parseTrustedHops` from `lib/zippy/client-ip.ts`.
- Produces: `POST /api/auth/registration-status` body `{ email: string }` returns `{ status: "pending" | "rejected" | "none" }`; 429 when more than 20 calls a minute from one client.

- [ ] **Step 1: Failing test for the bucket helper** `tests/registration-status.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { ipBucket, normalizeEmail } from "../lib/registration-status-bucket.ts";

test("ipBucket hashes the address and never contains it", () => {
  const bucket = ipBucket("203.0.113.9", (v) => `h${v.length}`);
  assert.equal(bucket, "regstatus:h10");
  assert.ok(!bucket.includes("203.0.113.9"));
});

test("a missing ip shares one bucket", () => {
  assert.equal(ipBucket(null, (v) => v), "regstatus:unknown");
});

test("normalizeEmail trims and lower-cases, and rejects non-strings and junk", () => {
  assert.equal(normalizeEmail("  Asha@B.CO "), "asha@b.co");
  for (const bad of [undefined, null, 5, "", "   ", "no-at-sign", "a@b".repeat(100)]) {
    assert.equal(normalizeEmail(bad), null, String(bad));
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/registration-status.test.mjs`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `lib/registration-status-bucket.ts`** (no imports)

```ts
// Pure helpers for the registration-status endpoint.
export function ipBucket(ip: string | null, hash: (value: string) => string): string {
  return ip ? `regstatus:${hash(ip)}` : "regstatus:unknown";
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "" || value.length > 254 || !value.includes("@")) return null;
  return value;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/registration-status.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the route** `app/api/auth/registration-status/route.ts`

```ts
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { statusAnswer } from "@/lib/registration-model";
import { ipBucket, normalizeEmail } from "@/lib/registration-status-bucket";
import { clientIpFromForwarded, parseTrustedHops } from "@/lib/zippy/client-ip";

const LIMIT_PER_MINUTE = 20;

// Tells the login page why a banned account cannot sign in. Reveals only pending / rejected for
// customers; never the rejection reason (that goes by email). Unknown and approved emails both answer "none".
export async function POST(request: NextRequest) {
  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for"),
    parseTrustedHops(process.env.ZIPPY_TRUSTED_PROXY_HOPS)
  );
  const bucket = ipBucket(ip, (value) => createHash("sha256").update(value).digest("hex").slice(0, 16));
  const { data: allowed, error: limitError } = await supabaseServer.rpc("zippy_hit", {
    p_bucket: bucket,
    p_window_seconds: 60,
    p_limit: LIMIT_PER_MINUTE,
  });
  if (limitError) return NextResponse.json({ error: "Please try again in a moment" }, { status: 502 });
  if (allowed === false) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ status: "none" });

  const { data, error } = await supabaseServer.rpc("registration_state_by_email", { p_email: email });
  if (error) return NextResponse.json({ error: "Please try again in a moment" }, { status: 502 });
  const row = Array.isArray(data) ? data[0] : null;
  return NextResponse.json({
    status: statusAnswer(row ? { role: row.role, approvalStatus: row.approval_status } : null),
  });
}
```

- [ ] **Step 6: Edit `app/customer/login/page.tsx`**

Add to the imports:

```ts
import {
  REGISTRATION_PENDING_POPUP,
  isBannedLoginError,
  loginBlockMessage,
} from "@/lib/registration-model";
```

Add state after `const [submitting, setSubmitting] = useState(false);`:

```ts
  const [showPendingPopup, setShowPendingPopup] = useState(false);
```

Replace the `if (signInError) { setError(signInError.message); return; }` block in `handleLogin` with:

```ts
    if (signInError) {
      if (isBannedLoginError(signInError.message)) {
        const res = await fetch("/api/auth/registration-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => null);
        const json = res && res.ok ? await res.json().catch(() => null) : null;
        const blocked = loginBlockMessage(json?.status ?? "none");
        setError(blocked ?? signInError.message);
        return;
      }
      setError(signInError.message);
      return;
    }
```

In `handleSignup`, replace the final `await handleLogin();` with:

```ts
    setSubmitting(false);
    setShowPendingPopup(true);
```

Add this function before `return (`:

```ts
  function closePendingPopup() {
    setShowPendingPopup(false);
    setPassword("");
    setFullName("");
    setPhone("");
    setLine1("");
    setLine2("");
    setCity("");
    setState("");
    setPincode("");
    setReferralCode("");
    setError(null);
    setMode("login");
  }
```

Add the popup as the first child inside the outer `<div className="mx-auto max-w-sm ...">` (right after its opening tag):

```tsx
      {showPendingPopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Registration submitted"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-brand-surface p-6 text-center shadow-xl">
            <p className="mb-4 text-brand-ink">{REGISTRATION_PENDING_POPUP}</p>
            <button
              type="button"
              onClick={closePendingPopup}
              className="rounded-[var(--radius-pill)] bg-brand-primary-text-safe px-5 py-2 font-semibold text-white"
            >
              OK
            </button>
          </div>
        </div>
      )}
```

(These setters already exist in this page: `setPassword`, `setFullName`, `setPhone`, `setLine1`, `setLine2`, `setCity`, `setState`, `setPincode`, `setReferralCode`, `setError`, `setMode`.)

- [ ] **Step 7: Type-check and lint the page**

Run: `npx tsc --noEmit` then `npx eslint app/customer/login/page.tsx app/api/auth/registration-status/route.ts`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/registration-status-bucket.ts tests/registration-status.test.mjs app/api/auth/registration-status/route.ts app/customer/login/page.tsx
git commit -m "feat(approval): registration-status endpoint, login block messages, pending popup"
```

---

### Task 5: Server-side guards (customer APIs and Zippy)

**Files:**
- Modify: `lib/customer-auth.ts`
- Modify: `lib/zippy/caller.ts`
- Modify: `app/api/zippy/chat/route.ts`
- Test: `tests/registration-guard.test.mjs`
- Create: `lib/registration-guard.ts`

**Interfaces:**
- Consumes: `isApproved`, `ZIPPY_LOGIN_REQUIRED_MESSAGE` (Task 2).
- Produces: `guardProfile(profile: { role?: unknown; approval_status?: unknown } | null): { ok: true } | { ok: false; reason: "unapproved" | "missing" }` in `lib/registration-guard.ts`; `POST /api/zippy/chat` returns `401 { error: ZIPPY_LOGIN_REQUIRED_MESSAGE, code: "login_required" }` for visitors.

- [ ] **Step 1: Failing test** `tests/registration-guard.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { guardProfile } from "../lib/registration-guard.ts";

test("only an approved profile passes", () => {
  assert.deepEqual(guardProfile({ role: "customer", approval_status: "approved" }), { ok: true });
  assert.deepEqual(guardProfile({ role: "vendor", approval_status: "approved" }), { ok: true });
});

test("pending, rejected, unknown and missing profiles are blocked", () => {
  for (const status of ["pending", "rejected", "x", null, undefined]) {
    assert.deepEqual(guardProfile({ role: "customer", approval_status: status }), { ok: false, reason: "unapproved" });
  }
  assert.deepEqual(guardProfile(null), { ok: false, reason: "missing" });
});
```

- [ ] **Step 2: Run to verify failure**, then write `lib/registration-guard.ts` (no imports):

Run: `node --test tests/registration-guard.test.mjs` (FAIL: module missing)

```ts
// Defence in depth: the Auth ban is the real gate, but a verified session whose profile is not
// approved must still never reach customer or Zippy APIs.
export function guardProfile(
  profile: { role?: unknown; approval_status?: unknown } | null
): { ok: true } | { ok: false; reason: "unapproved" | "missing" } {
  if (!profile) return { ok: false, reason: "missing" };
  return profile.approval_status === "approved" ? { ok: true } : { ok: false, reason: "unapproved" };
}
```

Run: `node --test tests/registration-guard.test.mjs` (PASS)

- [ ] **Step 3: Edit `lib/customer-auth.ts`**

Add `import { guardProfile } from "@/lib/registration-guard";`, change the select to `.select("role, approval_status")`, and after the `profile.role !== "customer"` line add:

```ts
  if (!guardProfile(profile).ok) {
    return { error: "Your registration has not been approved", status: 403 };
  }
```

- [ ] **Step 4: Edit `lib/zippy/caller.ts`**

Add `import { guardProfile } from "@/lib/registration-guard";`, change the select to `.select("role, approval_status")`, and after the `profileError` block add:

```ts
    if (profile && !guardProfile(profile).ok) {
      return { error: "Your account is not approved", status: 403 };
    }
```

- [ ] **Step 5: Edit `app/api/zippy/chat/route.ts`**

Add `import { ZIPPY_LOGIN_REQUIRED_MESSAGE } from "@/lib/registration-model";`. Directly after `const { caller } = resolved;` add:

```ts
  // Zippy answers only registered, signed-in people. The widget shows a popup; this is the server-side gate.
  if (!caller.userId) {
    return NextResponse.json(
      { error: ZIPPY_LOGIN_REQUIRED_MESSAGE, code: "login_required" },
      { status: 401 }
    );
  }
```

- [ ] **Step 6: Type-check and run the Zippy tests**

Run: `npx tsc --noEmit` and `node --test tests/zippy-*.test.mjs tests/registration-guard.test.mjs`
Expected: clean and passing. If a Zippy test asserted visitor chat behaviour through the route, update it to expect the 401 (search with `grep -ln "visitor" tests/zippy-*.test.mjs`).

- [ ] **Step 7: Commit**

```bash
git add lib/registration-guard.ts tests/registration-guard.test.mjs lib/customer-auth.ts lib/zippy/caller.ts app/api/zippy/chat/route.ts
git commit -m "feat(approval): customer APIs and Zippy refuse unapproved accounts; visitors get login_required"
```

---

### Task 6: Admin API

**Files:**
- Create: `lib/registration-admin.ts`
- Create: `app/api/admin/registrations/route.ts`
- Create: `app/api/admin/registrations/summary/route.ts`
- Create: `app/api/admin/registrations/[id]/approve/route.ts`
- Create: `app/api/admin/registrations/[id]/reject/route.ts`
- Test: `tests/registration-admin.test.mjs`

**Interfaces:**
- Consumes: RPCs `registration_requests`, `decide_registration` (Task 1); `cleanRejectionReason` (Task 2); `resolveAdmin`, `tokenFromRequest`.
- Produces: `shapeRegistrationRows(rows: unknown[]): RegistrationRow[]` with `RegistrationRow = { id; email; fullName; phone; line1; city; pincode; createdAt; status; reason; reviewedAt }`; `isUuid(value: string): boolean`; routes: `GET /api/admin/registrations?view=pending|history` returns `{ requests }`; `GET /api/admin/registrations/summary` returns `{ pending: number }`; `POST .../[id]/approve` returns `{ ok: true }`; `POST .../[id]/reject` body `{ reason }` returns `{ ok: true }`. Errors: 401/403 from `resolveAdmin`, 400 invalid id or reason, 404 not a customer, 409 `This request was already decided.`.

- [ ] **Step 1: Failing test** `tests/registration-admin.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { shapeRegistrationRows, isUuid } from "../lib/registration-admin.ts";

test("shapeRegistrationRows allow-lists fields and renames to camelCase", () => {
  const rows = shapeRegistrationRows([
    {
      user_id: "11111111-1111-4111-8111-111111111111", email: "a@b.co", full_name: "Asha", phone: "+91982",
      line1: "12 Rd", city: "Mumbai", pincode: "400050", created_at: "2026-10-08T10:00:00Z",
      approval_status: "pending", rejection_reason: null, reviewed_at: null,
      secret_field: "must not leak", password_hash: "x",
    },
  ]);
  assert.deepEqual(rows[0], {
    id: "11111111-1111-4111-8111-111111111111", email: "a@b.co", fullName: "Asha", phone: "+91982",
    line1: "12 Rd", city: "Mumbai", pincode: "400050", createdAt: "2026-10-08T10:00:00Z",
    status: "pending", reason: null, reviewedAt: null,
  });
  assert.ok(!("secret_field" in rows[0]) && !("password_hash" in rows[0]));
});

test("missing optional columns become null and non-arrays shape to an empty list", () => {
  assert.equal(shapeRegistrationRows([{ user_id: "u", email: "e", approval_status: "approved" }])[0].line1, null);
  assert.deepEqual(shapeRegistrationRows(null), []);
});

test("isUuid accepts v4-style ids only", () => {
  assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
  for (const bad of ["", "abc", "11111111-1111-4111-8111-11111111111", "11111111-1111-4111-8111-1111111111111", "' or 1=1 --"]) {
    assert.equal(isUuid(bad), false, bad);
  }
});
```

- [ ] **Step 2: Run to verify failure**, then write `lib/registration-admin.ts` (no imports):

Run: `node --test tests/registration-admin.test.mjs` (FAIL)

```ts
// Shapes registration rows for the admin API with an allow-list (never a row spread).
export type RegistrationRow = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  line1: string | null;
  city: string | null;
  pincode: string | null;
  createdAt: string | null;
  status: string;
  reason: string | null;
  reviewedAt: string | null;
};

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

export function shapeRegistrationRows(rows: unknown): RegistrationRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      id: String(row.user_id ?? ""),
      email: String(row.email ?? ""),
      fullName: str(row.full_name),
      phone: str(row.phone),
      line1: str(row.line1),
      city: str(row.city),
      pincode: str(row.pincode),
      createdAt: str(row.created_at),
      status: String(row.approval_status ?? ""),
      reason: str(row.rejection_reason),
      reviewedAt: str(row.reviewed_at),
    };
  });
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
```

Run: `node --test tests/registration-admin.test.mjs` (PASS)

- [ ] **Step 3: Write the list and summary routes**

`app/api/admin/registrations/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { shapeRegistrationRows } from "@/lib/registration-admin";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const view = request.nextUrl.searchParams.get("view") === "history" ? "history" : "pending";
  const { data, error } = await supabaseServer.rpc("registration_requests", { p_view: view });
  if (error) return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  return NextResponse.json({ requests: shapeRegistrationRows(data) });
}
```

`app/api/admin/registrations/summary/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { count, error } = await supabaseServer
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "customer")
    .eq("approval_status", "pending");
  if (error) return NextResponse.json({ error: "Failed to load the pending count" }, { status: 500 });
  return NextResponse.json({ pending: count ?? 0 });
}
```

- [ ] **Step 4: Write the approve route** `app/api/admin/registrations/[id]/approve/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { isUuid } from "@/lib/registration-admin";

const ALREADY_DECIDED = "This request was already decided.";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid request id" }, { status: 400 });

  const { data: row } = await supabaseServer
    .from("users")
    .select("role, approval_status")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.role !== "customer") return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (row.approval_status !== "pending") return NextResponse.json({ error: ALREADY_DECIDED }, { status: 409 });

  // Lift the ban first, then record the decision. If a concurrent decision wins, put the ban back
  // unless that decision was also an approval.
  const { error: unbanError } = await supabaseServer.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (unbanError) return NextResponse.json({ error: "Failed to approve" }, { status: 500 });

  const { data: decided, error: decideError } = await supabaseServer.rpc("decide_registration", {
    p_user_id: id,
    p_decision: "approved",
    p_reason: null,
    p_admin: resolved.adminId,
  });
  if (decideError || !Array.isArray(decided) || decided.length === 0) {
    const { data: now } = await supabaseServer.from("users").select("approval_status").eq("id", id).maybeSingle();
    if (now?.approval_status !== "approved") {
      await supabaseServer.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    }
    return decideError
      ? NextResponse.json({ error: "Failed to approve" }, { status: 500 })
      : NextResponse.json({ error: ALREADY_DECIDED }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Write the reject route** `app/api/admin/registrations/[id]/reject/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { isUuid } from "@/lib/registration-admin";
import { cleanRejectionReason } from "@/lib/registration-model";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid request id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const reason = cleanRejectionReason(body.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

  const { data: row } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.role !== "customer") return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // The ban stays on, so nothing else needs changing for a rejection.
  const { data: decided, error } = await supabaseServer.rpc("decide_registration", {
    p_user_id: id,
    p_decision: "rejected",
    p_reason: reason.value,
    p_admin: resolved.adminId,
  });
  if (error) return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
  if (!Array.isArray(decided) || decided.length === 0) {
    return NextResponse.json({ error: "This request was already decided." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Type-check, lint, then curl role gates against a running app**

Run: `npx tsc --noEmit` and `npx eslint app/api/admin/registrations lib/registration-admin.ts`
Then (app on :3000, local): confirm `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/registrations` prints `401`, and that a customer token gets `403` (use a throwaway test customer's token; never print it).
Expected: 401 without a token, 403 for a customer, 200 for the admin.

- [ ] **Step 7: Commit**

```bash
git add lib/registration-admin.ts tests/registration-admin.test.mjs app/api/admin/registrations
git commit -m "feat(approval): admin registrations API (list, summary, approve, reject)"
```

---

### Task 7: Admin UI (sidebar badge, Overview tile, Registrations page)

**Files:**
- Create: `app/admin/(portal)/registrations/page.tsx`
- Create: `app/admin/(portal)/registrations/loading.tsx`
- Modify: `components/admin/AdminShell.tsx`
- Modify: `app/admin/(portal)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/registrations`, `/summary`, `POST .../approve`, `.../reject` (Task 6); `REJECTION_REASON_MAX` (Task 2).
- Produces: route `/admin/registrations`; a `Registrations` link in the admin sidebar with a pending badge.

- [ ] **Step 1: Create `app/admin/(portal)/registrations/loading.tsx`**

```tsx
export default function Loading() {
  return <p className="p-4 text-brand-ink-muted">Loading registrations…</p>;
}
```

- [ ] **Step 2: Create the page** `app/admin/(portal)/registrations/page.tsx`

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { REJECTION_REASON_MAX } from "@/lib/registration-model";

type Row = {
  id: string; email: string; fullName: string | null; phone: string | null; line1: string | null;
  city: string | null; pincode: string | null; createdAt: string | null; status: string;
  reason: string | null; reviewedAt: string | null;
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "");

export default function RegistrationsPage() {
  const [view, setView] = useState<"pending" | "history">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/registrations?view=${view}`, { headers: await authHeader() });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "Failed to load registrations");
      setRows(body.requests);
      setError(null);
    } catch {
      setError("Failed to load registrations");
    }
  }, [view]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  async function approve(row: Row) {
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${row.id}/approve`, { method: "POST", headers: await authHeader() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? "Failed to approve");
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    const text = reason.trim();
    if (text === "") return setReasonError("A reason is required");
    setBusyId(rejecting.id);
    setReasonError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${rejecting.id}/reject`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setReasonError(body.error ?? "Failed to reject");
      setRejecting(null);
      setReason("");
    } finally {
      setBusyId(null);
      await load();
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-[var(--radius-card)] bg-brand-ink px-4 py-3">
        <h1 className="font-heading text-2xl text-white">Registrations</h1>
      </div>
      <div className="mb-4 flex gap-2">
        {(["pending", "history"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setView(tab)}
            className={`rounded-[var(--radius-pill)] px-4 py-1 text-sm ${view === tab ? "bg-brand-primary-text-safe text-white" : "border border-brand-ink-muted/20 text-brand-ink"}`}
          >
            {tab === "pending" ? "Pending" : "History"}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {rows.length === 0 ? (
        <p className="text-brand-ink-muted">{view === "pending" ? "No registrations are waiting for approval." : "No decisions yet."}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-brand-ink-muted/15 bg-brand-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-brand-ink-muted">
              <tr>
                <th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Phone</th>
                <th className="p-3">Address</th><th className="p-3">{view === "pending" ? "Requested" : "Decision"}</th>
                {view === "pending" && <th className="p-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-brand-ink-muted/10 align-top">
                  <td className="p-3">{row.fullName}</td>
                  <td className="p-3 break-all">{row.email}</td>
                  <td className="p-3">{row.phone}</td>
                  <td className="p-3">{[row.line1, row.city, row.pincode].filter(Boolean).join(", ")}</td>
                  <td className="p-3">
                    {view === "pending" ? when(row.createdAt) : (
                      <span>
                        <b className="capitalize">{row.status}</b> {when(row.reviewedAt)}
                        {row.reason && <span className="block text-brand-ink-muted">{row.reason}</span>}
                      </span>
                    )}
                  </td>
                  {view === "pending" && (
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button type="button" disabled={busyId === row.id} onClick={() => void approve(row)}
                          className="rounded-[var(--radius-pill)] bg-brand-primary-text-safe px-3 py-1 text-white disabled:opacity-50">Approve</button>
                        <button type="button" disabled={busyId === row.id} onClick={() => { setRejecting(row); setReason(""); setReasonError(null); }}
                          className="rounded-[var(--radius-pill)] border border-red-600 px-3 py-1 text-red-700 disabled:opacity-50">Reject</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rejecting && (
        <div role="dialog" aria-modal="true" aria-label="Reject registration" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-xl">
            <h2 className="mb-1 font-heading text-lg text-brand-ink">Reject {rejecting.fullName ?? rejecting.email}</h2>
            <p className="mb-3 text-sm text-brand-ink-muted">The reason is emailed to the applicant.</p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={REJECTION_REASON_MAX}
              rows={4}
              className="w-full rounded-lg border border-brand-ink-muted/30 p-2 text-brand-ink"
              aria-label="Reason for rejection"
            />
            <p className="mt-1 text-right text-xs text-brand-ink-muted">{reason.length}/{REJECTION_REASON_MAX}</p>
            {reasonError && <p className="mb-2 text-sm text-red-600">{reasonError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRejecting(null)} className="rounded-[var(--radius-pill)] border border-brand-ink-muted/30 px-4 py-1">Cancel</button>
              <button type="button" disabled={busyId === rejecting.id} onClick={() => void confirmReject()}
                className="rounded-[var(--radius-pill)] bg-red-700 px-4 py-1 text-white disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Edit `components/admin/AdminShell.tsx` (sidebar link and badge)**

Add `useEffect` to the react import (`import { useEffect, useState } from "react";`). Add to `NAV_LINKS` after the Orders line: `{ href: "/admin/registrations", label: "Registrations" },`. Inside the component, after `const [drawerOpen, setDrawerOpen] = useState(false);` add:

```tsx
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!adminId) return;
    let cancelled = false;
    async function refresh() {
      try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/registrations/summary", {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        });
        const body = await res.json();
        if (!cancelled && res.ok) setPending(body.pending);
      } catch {
        // The badge is a convenience; a failed refresh keeps the last count.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [adminId, pathname]);
```

Inside the `NAV_LINKS.map`, replace `{link.label}` with:

```tsx
                {link.label}
                {link.href === "/admin/registrations" && pending > 0 && (
                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-brand-ink">{pending}</span>
                )}
```

- [ ] **Step 4: Edit `app/admin/(portal)/dashboard/page.tsx` (Overview tile)**

Add `import Link from "next/link";` to the imports. Add state `const [pendingRegistrations, setPendingRegistrations] = useState(0);`. In `load()`, after the `oRes`/`rRes` success block's `setVendorCount(...)` line add:

```tsx
      const sRes = await fetch("/api/admin/registrations/summary", { headers });
      if (sRes.ok) setPendingRegistrations((await sRes.json()).pending);
```

Directly after `<AutoOrderCard />` add:

```tsx
      <Link
        href="/admin/registrations"
        className="mb-6 block rounded-[var(--radius-card)] bg-brand-accent-text-safe p-4 text-white"
      >
        <p className="text-sm text-white/80">Registrations awaiting approval</p>
        <p className="font-heading text-3xl">{pendingRegistrations}</p>
      </Link>
```

(`bg-brand-accent` is a defined token, `#1E8A3E`; white text on it is below WCAG contrast for small text, so use `bg-brand-accent-text-safe` (`#187033`) for the tile instead.)

- [ ] **Step 5: Type-check, lint, build**

Run: `npx tsc --noEmit`, `npx eslint components/admin/AdminShell.tsx "app/admin/(portal)"`, then `npm run build` (stop any dev server using `.next` first: see CLAUDE.md, never build against a running dev server's `.next`; use the production build only when the all-roles dev servers are stopped).
Expected: clean; the new route appears in the build output.

- [ ] **Step 6: Commit**

```bash
git add components/admin/AdminShell.tsx "app/admin/(portal)/registrations" "app/admin/(portal)/dashboard/page.tsx"
git commit -m "feat(approval): admin Registrations page, sidebar badge and Overview tile"
```

---

### Task 8: Email route, n8n workflow 11, config and docs

**Files:**
- Create: `app/api/internal/registrations/[id]/email/route.ts`
- Create: `n8n/workflows/11-registration-events.json`
- Modify: `tests/n8n-workflows.test.mjs` (add workflow 11 checks)
- Modify: `.env.example`
- Modify: `docs/n8n-webhook-setup.md` (append a Workflow 11 section)

**Interfaces:**
- Consumes: RPCs `registration_email_context`, `registration_admin_emails` (Task 1); `buildRegistrationEmail` (Task 2); `verifyInternalSecret`; `BRAND` from `@/lib/branding`.
- Produces: `GET /api/internal/registrations/[id]/email?event=submitted|approved|rejected` returns `{ to, emailSubject, emailHtml }`, or 404 (no admin email / no such customer), 409 (event does not match the current status), 400 (bad event).

- [ ] **Step 1: Write the route** `app/api/internal/registrations/[id]/email/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { isUuid } from "@/lib/registration-admin";
import { buildRegistrationEmail, type RegistrationEmailEvent } from "@/lib/registration-email";
import { BRAND } from "@/lib/branding";

const EVENTS: Record<string, { event: RegistrationEmailEvent; status: string }> = {
  submitted: { event: "submitted", status: "pending" },
  approved: { event: "approved", status: "approved" },
  rejected: { event: "rejected", status: "rejected" },
};

// Called by n8n workflow 11. Returns ready-made email content so the workflow only has to send it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  const spec = EVENTS[request.nextUrl.searchParams.get("event") ?? ""];
  if (!isUuid(id) || !spec) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { data, error } = await supabaseServer.rpc("registration_email_context", { p_user_id: id });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  // A stale or replayed event (the status moved on) must not send a wrong email.
  if (row.approval_status !== spec.status) {
    return NextResponse.json({ error: "Event does not match the current status" }, { status: 409 });
  }

  let to: string = row.email;
  if (spec.event === "submitted") {
    const { data: admins, error: adminError } = await supabaseServer.rpc("registration_admin_emails");
    const list = Array.isArray(admins) ? (admins as string[]).filter(Boolean) : [];
    if (adminError || list.length === 0) {
      console.error("registration email: no admin email found");
      return NextResponse.json({ error: "No admin email" }, { status: 404 });
    }
    to = list.join(",");
  }

  const base = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const address = [row.line1, row.line2, row.city, row.state, row.pincode].filter(Boolean).join(", ");
  const { subject, html } = buildRegistrationEmail({
    event: spec.event,
    brandName: BRAND.name,
    fullName: row.full_name ?? "",
    email: row.email,
    phone: row.phone ?? "",
    address,
    reason: row.rejection_reason ?? undefined,
    adminUrl: `${base}/admin/registrations`,
    loginUrl: `${base}/customer/login`,
  });
  return NextResponse.json({ to, emailSubject: subject, emailHtml: html });
}
```

(`BRAND.name` is `"Fresh & Quick"` in `lib/branding.ts`.)

- [ ] **Step 2: Write the workflow** `n8n/workflows/11-registration-events.json`

```json
{
  "id": "registrationEvents11",
  "name": "11 - Registration Events",
  "nodes": [
    {
      "id": "registration-webhook",
      "name": "Supabase Webhook: users registration status",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 200],
      "webhookId": "f47ac10b-58cc-4372-a567-0e02b2c3d011",
      "parameters": {
        "httpMethod": "POST",
        "path": "foodhub/registration-event",
        "responseMode": "onReceived"
      },
      "notes": "Fired by the n8n_registration_submitted (new pending customer) and n8n_registration_decided (status changed) triggers on public.users. The body carries record.id and record.approval_status."
    },
    {
      "id": "get-registration-email",
      "name": "GET /api/internal/registrations/:id/email",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [520, 200],
      "parameters": {
        "method": "GET",
        "url": "={{$env.APP_BASE_URL}}/api/internal/registrations/{{$json[\"body\"][\"record\"][\"id\"]}}/email?event={{$json[\"body\"][\"record\"][\"approval_status\"] === \"pending\" ? \"submitted\" : $json[\"body\"][\"record\"][\"approval_status\"]}}",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "X-Internal-Secret", "value": "={{$env.N8N_INTERNAL_SECRET}}" }
          ]
        },
        "options": { "response": { "response": { "neverError": true } } }
      },
      "notes": "Returns { to, emailSubject, emailHtml }, or an error body (404 no admin email, 409 stale event) which the next node skips."
    },
    {
      "id": "has-recipient",
      "name": "Has recipient",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [800, 200],
      "parameters": {
        "conditions": {
          "string": [
            { "value1": "={{String(Boolean($json[\"to\"]))}}", "value2": "true" }
          ]
        }
      }
    },
    {
      "id": "send-registration-email",
      "name": "Gmail: Send Registration Email",
      "type": "n8n-nodes-base.gmail",
      "typeVersion": 2,
      "position": [1080, 160],
      "parameters": {
        "resource": "message",
        "operation": "send",
        "sendTo": "={{$json[\"to\"]}}",
        "subject": "={{$json[\"emailSubject\"]}}",
        "emailType": "html",
        "message": "={{$json[\"emailHtml\"]}}",
        "options": {}
      },
      "credentials": {
        "gmailOAuth2": {
          "id": "PLACEHOLDER_CONNECT_YOUR_GMAIL_CREDENTIAL",
          "name": "Gmail account (connect in n8n UI)"
        }
      },
      "notes": "Credential intentionally left as a placeholder -- select your own Gmail OAuth2 credential after importing. This send is LIVE once published: it emails the admin on every new registration and the customer on every decision. Test only with addresses you own."
    }
  ],
  "connections": {
    "Supabase Webhook: users registration status": {
      "main": [[{ "node": "GET /api/internal/registrations/:id/email", "type": "main", "index": 0 }]]
    },
    "GET /api/internal/registrations/:id/email": {
      "main": [[{ "node": "Has recipient", "type": "main", "index": 0 }]]
    },
    "Has recipient": {
      "main": [[{ "node": "Gmail: Send Registration Email", "type": "main", "index": 0 }], []]
    }
  },
  "active": false,
  "settings": { "executionOrder": "v1", "timezone": "Asia/Kolkata" }
}
```

- [ ] **Step 3: Add the workflow tests to `tests/n8n-workflows.test.mjs`** (append at the end)

```js
test("workflow 11 registration events: webhook path, internal call, recipient check, live Gmail send", () => {
  const wf = load("11-registration-events.json");
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const hook = Object.values(byName).find((n) => n.type === "n8n-nodes-base.webhook");
  assert.equal(hook.parameters.path, "foodhub/registration-event");
  const call = Object.values(byName).find((n) => n.type === "n8n-nodes-base.httpRequest");
  assert.match(call.parameters.url, /\/api\/internal\/registrations\//);
  assert.ok(call.parameters.headerParameters.parameters.some((h) => h.name === "X-Internal-Secret"));
  const gate = byName["Has recipient"];
  assert.match(gate.parameters.conditions.string[0].value1, /^=\{\{String\(/);
  const gmail = Object.values(byName).find((n) => n.type === "n8n-nodes-base.gmail");
  assert.equal(gmail.parameters.emailType, "html");
  assert.equal(wf.active, false);
});
```

(`load` and the PLACEHOLDER credential checks are already in the file and cover workflow 11 automatically.)

- [ ] **Step 4: Run the workflow tests**

Run: `node --test tests/n8n-workflows.test.mjs`
Expected: pass.

- [ ] **Step 5: `.env.example`**: no new variable is added here. `PUBLIC_APP_URL` already exists from the C1 review email
  (default `http://localhost:3000`; set it to the public site address when a tunnel is in use).

- [ ] **Step 6: Append a "Workflow 11" section to `docs/n8n-webhook-setup.md`**

```markdown
## Workflow 11: Registration events (customer approval)

File: `n8n/workflows/11-registration-events.json`. Import it like the others (needs a top-level `id`; publish in the n8n UI, never restart the `--rm` container, connect your Gmail credential in the Gmail node). Trigger: webhook `POST /webhook/foodhub/registration-event`, fired by the `n8n_registration_submitted` and `n8n_registration_decided` triggers on `public.users`. It calls `GET {APP_BASE_URL}/api/internal/registrations/:id/email?event=submitted|approved|rejected` and, when the answer has a recipient, sends it with Gmail: new registration to every admin account's email, approval and rejection to the customer. The Gmail send is LIVE: test only with addresses you own. Links in the emails are built from `PUBLIC_APP_URL` (default `http://localhost:3000`). Until the workflow is published, registrations still work; the emails just do not go out.
```

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit`
```bash
git add app/api/internal/registrations n8n/workflows/11-registration-events.json tests/n8n-workflows.test.mjs .env.example docs/n8n-webhook-setup.md
git commit -m "feat(approval): registration email route and n8n workflow 11"
```

---

### Task 9: Zippy popup (web) and knowledge text

**Files:**
- Modify: `components/zippy/ZippyWidget.tsx`
- Modify: `knowledge/glossary.md`, `knowledge/policy/privacy-terms-contact.md`, `knowledge/customer/ask-zippy.md`, `knowledge/customer/account-and-signin.md`
- Test: `tests/registration-zippy.test.mjs` (pure helper) and `lib/zippy-gate.ts`

**Interfaces:**
- Consumes: `ZIPPY_LOGIN_REQUIRED_MESSAGE` (Task 2); the server 401 from Task 5.
- Produces: `isLoginRequiredError(status: number, message: string): boolean` in `lib/zippy-gate.ts`; widget popup.

- [ ] **Step 1: Failing test** `tests/registration-zippy.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { isLoginRequiredError } from "../lib/zippy-gate.ts";
import { ZIPPY_LOGIN_REQUIRED_MESSAGE } from "../lib/registration-model.ts";

test("only a 401 carrying the login-required text opens the popup", () => {
  assert.equal(isLoginRequiredError(401, ZIPPY_LOGIN_REQUIRED_MESSAGE, ZIPPY_LOGIN_REQUIRED_MESSAGE), true);
  assert.equal(isLoginRequiredError(401, "Please sign in again to keep chatting with Zippy.", ZIPPY_LOGIN_REQUIRED_MESSAGE), false);
  assert.equal(isLoginRequiredError(502, ZIPPY_LOGIN_REQUIRED_MESSAGE, ZIPPY_LOGIN_REQUIRED_MESSAGE), false);
});
```

Run: `node --test tests/registration-zippy.test.mjs` (FAIL: module missing)

- [ ] **Step 2: Write `lib/zippy-gate.ts`** (no imports) and re-run

```ts
// The widget compares the server's 401 text with the login-required text; an expired session keeps its own message.
export function isLoginRequiredError(status: number, message: string, loginRequiredText: string): boolean {
  return status === 401 && message === loginRequiredText;
}
```

Run: `node --test tests/registration-zippy.test.mjs` (PASS)

- [ ] **Step 3: Edit `components/zippy/ZippyWidget.tsx`**

Imports: add `import Link from "next/link";` after the react import; add
```ts
import { ZIPPY_LOGIN_REQUIRED_MESSAGE } from "@/lib/registration-model";
import { isLoginRequiredError } from "@/lib/zippy-gate";
```
after the `ActionCards` import.

State: after `const [userId, setUserId] = useState<string | null>(null);` add
```ts
  const [authResolved, setAuthResolved] = useState(false);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
```

In the `apply` function inside the auth `useEffect`, add `setAuthResolved(true);` after `setUserId(next);`.

In the `send` catch block, replace `const message = error instanceof ZippyError ? error.message : ZIPPY_ERROR_MESSAGE;` with:
```ts
        if (error instanceof ZippyError && isLoginRequiredError(error.status, error.message, ZIPPY_LOGIN_REQUIRED_MESSAGE)) {
          setMessages([]);
          setOpen(false);
          setShowLoginPopup(true);
          return;
        }
        const message = error instanceof ZippyError ? error.message : ZIPPY_ERROR_MESSAGE;
```

Replace the bubble `onClick={() => setOpen((v) => !v)}` with:
```tsx
        onClick={() => {
          // Wait for the session check, then send signed-out visitors to the popup instead of a chat.
          if (!authResolved) return;
          if (!userId) return setShowLoginPopup(true);
          setOpen((v) => !v);
        }}
```

Add the popup directly after `<div className="zippy-anchor fixed bottom-4 right-4 z-40">` (first child):
```tsx
      {showLoginPopup && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Sign in required"
          className="mb-3 w-[min(24rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-brand-ink-muted/15 bg-brand-surface p-4 shadow-xl"
        >
          <p className="mb-3 text-sm text-brand-ink">{ZIPPY_LOGIN_REQUIRED_MESSAGE}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowLoginPopup(false)} className="rounded-full border border-brand-ink-muted/30 px-4 py-1 text-sm">
              Close
            </button>
            <Link href="/customer/login" onClick={() => setShowLoginPopup(false)} className="rounded-full bg-brand-primary-text-safe px-4 py-1 text-sm font-semibold text-white">
              Register or log in
            </Link>
          </div>
        </section>
      )}
```

Check `ZippyError` exposes `status` (it does: `lib/zippy/client-api.ts` sets `this.status`).

- [ ] **Step 4: Edit the knowledge text (fact-check against the code first)**

- `knowledge/glossary.md` line starting `Zippy is the in-app help assistant`: replace `(for any visitor, no restriction by role)` with `(only for people who have registered and signed in)`.
- `knowledge/policy/privacy-terms-contact.md`: replace `A visitor's chat is temporary.` with `Zippy answers only registered, signed-in people; a visitor who opens it is asked to register and log in.`
- `knowledge/customer/ask-zippy.md`: add the Q&A `## Why does Zippy ask me to register and log in?` with: `Zippy answers only people who have registered and signed in, so that only validated people use the app and the chat. If you are not signed in, tapping Zippy shows a message asking you to register and log in first.`
- `knowledge/customer/account-and-signin.md`: add `## What happens after I register?` with: `A new customer registration is checked by the admin. After you submit the form you see a message that your approval is in progress, and you cannot log in yet. You get an email when the admin approves it, with a link to log in, or when the admin rejects it, with the reason. A rejected email can register again with corrected details.`

- [ ] **Step 5: Type-check, lint, run knowledge tests**

Run: `npx tsc --noEmit`, `npx eslint components/zippy/ZippyWidget.tsx`, `node --test tests/zippy-knowledge.test.mjs tests/registration-zippy.test.mjs`
Expected: clean and passing.

- [ ] **Step 6: Commit**

```bash
git add components/zippy/ZippyWidget.tsx lib/zippy-gate.ts tests/registration-zippy.test.mjs knowledge
git commit -m "feat(approval): Zippy login popup on web and knowledge text"
```

---

### Task 10: Live verification, docs and close-out

**Files:**
- Modify: `scripts/zippy-eval.mjs` and/or `scripts/zippy-facts-check.mjs` (only if they call the chat route without a token)
- Modify: `docs/User_Manual.docx` (via the "Update Manuals" procedure), `CLAUDE.md`, `MEMORY.md`, `README.md`

- [ ] **Step 1: Check the Zippy scripts still work with the visitor block**

Run: `grep -n "api/zippy/chat\|Authorization" scripts/zippy-eval.mjs scripts/zippy-facts-check.mjs`
If either posts to `/api/zippy/chat` with no Authorization header, add an optional `ZIPPY_EVAL_TOKEN` env var read into an `Authorization: Bearer` header, add a one-line usage note in the script header, and extend its stub-server test (`tests/zippy-eval-cli.test.mjs`) to assert the header is sent. A signed-in approved customer's token is supplied by Vishal in his own shell; never print it.

- [ ] **Step 2: Full automated gate**

Run: `node --test tests/*.test.mjs`, `npx tsc --noEmit`, `npx eslint`, and (with no dev server on the same `.next`) `npm run build`.
Expected: all green. Fix before continuing.

- [ ] **Step 3: Confirm the GoTrue ban error text live**

With a pending test customer (Step 4), run `curl -s -X POST "<supabase>/auth/v1/token?grant_type=password" -H "apikey: <anon>" -H "Content-Type: application/json" -d '{"email":"<test>","password":"<pw>"}'` against the local stack and confirm the error message contains `banned` (the model's `isBannedLoginError` depends on it). If it does not, fix `isBannedLoginError` and its test first.

- [ ] **Step 4: Live browser run (Claude in Chrome first, Playwright only as fallback)**

Use throwaway test customers with addresses Vishal owns (live Gmail). Confirm, writing down what was seen:
1. Register on `/customer/login`: the popup text appears, no session, form returns to Log in.
2. Log in as the pending user: message "Your registration is still awaiting admin approval."; `curl` to a customer API with a forged or missing token still 401.
3. Admin portal: the sidebar badge and the Overview tile show 1; Registrations lists the request with correct details.
4. Approve: the customer can log in; the approval email arrives (one email).
5. Register a second user, reject with a reason: login shows the rejected message; the rejection email shows the reason; register again with the same email: it is pending again; a third attempt while pending shows "already awaiting approval".
6. Signed out, tap Zippy: the popup with the exact text and no `/api/zippy/chat` request; signed-in approved customer: chat works; an expired-session simulation shows "Please sign in again".
7. Registering with an existing approved email shows "already exists. Please log in."
Also confirm the admin email arrived for each new registration. If workflow 11 is not yet imported and published, import and publish it in the n8n UI first (Vishal's step); if emails do not arrive, check the n8n execution record and the dev log for the internal route.

- [ ] **Step 5: Delete the throwaway test accounts** (Reset Data's customer step, scoped to the test ids, after a backup per the standing rule) and confirm counts.

- [ ] **Step 6: Update the docs**

Run the standing "Update Manuals" procedure for `docs/User_Manual.docx` (sign-up popup, approval wait, admin Registrations page, Zippy sign-in requirement; version bump, static TOC renumber, PDF regenerate); do not touch the phone manual (piece 2). Update `CLAUDE.md` (a paragraph for this feature and the lessons from the run), `MEMORY.md`, `README.md`, and check `AGENTS.md`. Re-ingest `knowledge/` (`POST` the n8n webhook `foodhub/zippy-ingest`) and re-run `node scripts/zippy-eval.mjs` (Vishal runs it; it needs `N8N_INTERNAL_SECRET` and now a token for the chat route).

- [ ] **Step 7: Commit via "Commit Work"** and report what was verified live versus only tested.
