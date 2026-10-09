# Registration approval and Zippy sign-in gate — design

Date: 2026-10-08. Status: awaiting Vishal's review. Scope of THIS spec: **piece 1 (backend + web)**.
Pieces 2 and 3 are outlined at the end and get their own specs.

## 1. Goal

A new customer who registers must be approved by the admin before they can log in or use the site.
The admin is emailed about each new registration, sees a Pending count, and approves or rejects
(rejection needs a reason). The customer is emailed the outcome. Zippy answers only people who are
registered and signed in.

Success looks like: a fresh sign-up cannot log in until approved; the admin gets one email per
request; approve and reject each send one email to the customer; a rejected email cannot log in but
can register again; a visitor who taps Zippy sees the required popup and no chat request is served.

## 2. Decisions already made (Vishal, 2026-10-08)

| Question | Decision |
|---|---|
| Who needs approval | Customers only (vendors are admin-added, delivery-partner self sign-up unchanged) |
| Admin email recipient | The admin account's own email (every user with role `admin`) |
| After a rejection | The same email may register again; it returns to Pending |
| Mobile admin | A real admin area in the phone app (piece 3) |
| Login blocking | Server-enforced: the Supabase Auth account is banned until approved |

Assumptions to confirm in review: existing accounts become `approved`; staff roles (vendor,
delivery, admin) that are signed in may use Zippy; the Zippy popup replaces the visitor chat entirely
(including how-to questions).

## 3. Decomposition

1. **Piece 1 (this spec):** database, sign-up, login messages, status endpoint, admin API and
   Registrations page, n8n workflow 11 and three emails, Zippy gate on web and server, web manual,
   knowledge text.
2. **Piece 2:** phone customer app: sign-up popup, login messages, Zippy popup.
3. **Piece 3:** phone admin area (new role on mobile): login, pending count, approve/reject.

Each piece is specified, planned, built and merged on its own. Pieces 2 and 3 depend on the server
work in piece 1 and add no backend of their own beyond what piece 1 provides.

## 4. Data model (migration 41)

On `public.users` (existing table, `role` already there):

- `approval_status text not null default 'approved' check (approval_status in ('pending','approved','rejected'))`
- `rejection_reason text` (null unless rejected; max 500 chars enforced in the route and a check)
- `reviewed_at timestamptz`, `reviewed_by uuid references public.users(id) on delete set null`
- partial index on `(created_at)` where `approval_status = 'pending'`

The default `approved` means every existing account, and every vendor, partner and admin created by
other paths, stays usable with no backfill. Only the customer sign-up path writes `pending`.

SQL helper `public.registration_state_by_email(p_email text)` (SECURITY DEFINER, `search_path = ''`,
execute granted to `service_role` only) returns `(user_id uuid, role text, approval_status text)` by
joining `auth.users` to `public.users` on a lower-cased email. It is the only place the app looks up
an account by email, so sign-up and the status endpoint share one rule.

SQL function `public.decide_registration(p_user_id uuid, p_decision text, p_reason text, p_admin uuid)`
(SECURITY DEFINER, service role only) does the guarded status change in one statement:
`update users set approval_status = ..., rejection_reason = ..., reviewed_at = now(), reviewed_by = ...
where id = p_user_id and role = 'customer' and approval_status = 'pending' returning ...`; zero rows
means "not pending" and the route answers 409. This makes a double click or two admins safe.

Triggers (same pattern as migrations 15 and 40, posting through `public.n8n_notify(...)` to
`http://host.docker.internal:5678/webhook/foodhub/registration-event`):

- `after insert on users when (new.approval_status = 'pending')`
- `after update of approval_status on users when (old.approval_status is distinct from new.approval_status)`
  (covers pending, approved, rejected, and rejected back to pending on re-register)

RLS: `users` already has its policies; nothing is added. The new columns are readable only through the
existing own-row read policy and the service role. No write policy is added (the CLAUDE.md rule).
Check `pg_policies` for `users` before the migration and record the result in the plan.

## 5. Sign-up (`POST /api/auth/signup`, `lib/signup-pipeline.ts`)

Order stays: validate, referral check, geocode, then create. New steps:

1. After validation and geocoding succeed, call `registration_state_by_email(email)`.
   - none: create the account (below).
   - `pending`: 409 "Your registration is already awaiting approval."
   - `approved`: 409 "An account with this email already exists. Please log in."
   - `rejected` and role `customer`: **re-register** (below).
   - any other role: 409 as for `approved`.
2. Create: `auth.admin.createUser({ email, password, email_confirm: true, ban_duration: '876000h' })`
   (the account is banned from creation, so there is no window where it can log in), insert the
   `users` row with `approval_status = 'pending'`, the default Home address and saved location as today.
   If a later insert fails the auth user is deleted, as today.
3. Re-register of a rejected email: `auth.admin.updateUserById` with the new password (ban stays),
   update the `users` row (name, phone, saved location), replace the default address, set
   `approval_status = 'pending'`, clear `rejection_reason`, `reviewed_at`, `reviewed_by`.
   A rejected account never held orders, wallet or favorites, so nothing is lost. A referral code on a
   re-register is ignored when a referral link already exists for that user.
4. Success returns `200 { status: "pending" }`. **No automatic login.** The route no longer implies a
   session.

The web form (`app/customer/login/page.tsx`) stops calling `handleLogin()` after sign-up and instead
shows a modal: "Your registration approval is in progress. We will email you once the admin has
reviewed it." with an OK button that returns to the Log in mode with the form cleared.

## 6. Login messages and status endpoint

GoTrue answers a banned user's `signInWithPassword` with an error whose message is "User is banned"
(exact error code to be confirmed live in the plan). The customer login page treats that case by
calling `POST /api/auth/registration-status { email }`, which returns `{ status: "pending" | "rejected" | "none" }`.
Messages: pending: "Your registration is still awaiting admin approval."; rejected: "Your registration
was rejected. Please check your email for the reason."; none: the normal error. `approved` never
reaches this endpoint because an approved user is not banned.

Privacy tradeoff, accepted: the endpoint tells anyone who knows an email that it is pending or rejected.
It never returns the rejection reason (the reason goes only by email), answers `none` for unknown and for
approved accounts, and is rate limited per client IP (reuse the Zippy limiter helpers where they fit; the
plan decides, and sets the limit as an env var with a validated default).

Defence in depth: `lib/customer-auth.ts` and `lib/zippy/caller.ts` also reject a verified session whose
profile `approval_status` is not `approved`, so an unbanned-by-mistake account still cannot call customer
APIs.

## 7. Admin approval

API (all via `resolveAdmin`, Bearer token, service-role reads; allow-lists, never row spreads):

- `GET /api/admin/registrations?view=pending|history` returns name, email, phone, address line, city,
  pincode, `created_at`, and for history also status, reason, `reviewed_at`. Email comes from `auth.users`
  through the admin API, not from a `users` column.
- `GET /api/admin/registrations/summary` returns `{ pending: n }`. The Overview tile, the sidebar badge and
  (piece 3) the phone landing screen all read this one route.
- `POST /api/admin/registrations/[id]/approve`: lift the ban first
  (`updateUserById(id, { ban_duration: 'none' })`), then `decide_registration(..., 'approved')`. If the
  second step fails, re-apply the ban best effort and return 500. Retrying is safe (idempotent).
- `POST /api/admin/registrations/[id]/reject { reason }`: reason required, 1 to 500 characters after
  trimming, control characters rejected like the shared review comment cleaner; calls
  `decide_registration(..., 'rejected', reason)`. The ban stays.

UI: a "Registrations" item in the admin sidebar with a badge showing the pending count, a "Pending
approvals" tile on the Overview (the admin "login landing"), and a page with two tabs. Pending: a table
of requests, each row with Approve and Reject; Reject opens a dialog with a required reason field and a
visible character counter. History: decided requests with decision, reason and date. It lives in
`app/admin/(portal)/registrations/`, inside the existing route group, with a sibling `loading.tsx`.
Counts refresh on a short poll and after every decision.

## 8. Emails (n8n workflow 11 "Registration events")

Webhook `foodhub/registration-event` receives the trigger payload and calls a new internal route
`GET /api/internal/registrations/[id]/email?event=submitted|approved|rejected` (internal secret) that
returns `{ to, subject, html }`:

- **submitted** (status became pending): to every admin account's email; subject "New registration
  awaiting approval"; body with the applicant's name, email, phone and address and a button to the admin
  Registrations page.
- **approved**: to the customer; "You're approved" with a Log in button to `APP_PUBLIC_URL/customer/login`
  and the line that they sign in with the email and password they chose at registration.
- **rejected**: to the customer; shows the admin's reason and says they may register again.

All dynamic text goes through the existing `escapeHtml`; links are built only from `APP_PUBLIC_URL` (new
env var, default `http://localhost:3000`, set to the public site address when the tunnel is used) and must be
https unless it is localhost. The workflow ends in Gmail send nodes. If no admin email exists the route
returns 404 and the failure is logged; the registration itself is never blocked by an email failure.
These are LIVE emails from Vishal's Gmail: tests use only addresses he owns, one at a time, and ask first.
Import and publish workflow 11 in the n8n UI; never restart or stop the `--rm` n8n container.

## 9. Zippy gate

- `POST /api/zippy/chat`: a request with no Authorization header now returns
  `401 { error: "login_required" }` instead of serving a visitor chat. Signed-in callers of any role with
  `approval_status = 'approved'` are served as today. The visitor-only rate limits stay in code but are
  unreachable for chat; the plan decides whether to remove them.
- Web `ZippyWidget`: the bubble stays visible for everyone. When the visitor is not signed in, tapping it
  opens a popup (not the chat) with exactly:
  "I am sorry I cannot respond to you till you register and log in. This is necessary to ensure that only
  validated people are allowed to use the Application & Chat." and a button to the customer login page.
  A 401 `login_required` from the server (an expired session) shows the same popup.
- `knowledge/` text that says visitors can chat is corrected; re-ingest and re-run the eval afterwards.

## 10. Edge cases

- Two admins act on one request: the second gets 409 "already decided".
- Applicant logs in before approval: login fails with the pending message; no session exists.
- Admin deletes nothing here; rejected accounts remain (banned) so the email stays recognisable.
- Password reset for a pending or rejected account is out of scope; the ban makes it moot.
- Pending users never reach the Zippy or customer APIs (ban plus the server checks in section 6).
- Reset Data: customer accounts are deleted as today (cascade), so no new customer data table needs
  adding to that rule.
- Sign-up and re-register use the same address pipeline, so a rejected user fixing a bad address works.

## 11. Testing

- SQL, rolled back (`supabase/tests/registration_approval.sql`): default status, `decide_registration`
  rules (pending only, customers only, reason stored, second call returns nothing), the three trigger
  cases fire once each, `registration_state_by_email` casing.
- Node tests, pure and injected dependencies: the sign-up pipeline branches (none, pending, approved,
  rejected re-register, non-customer role, referral on re-register), reason validation, status endpoint
  shaping and limiter, email builders (escaping, https-only links, per event), Zippy gate and caller
  rejection of non-approved profiles, admin allow-list shaping (no spreads).
- Live, in a real browser (mandatory, per the project's lessons): register on the web, see the popup,
  confirm login is refused with the pending message, approve in the admin portal, confirm the approval
  email and a successful login; register another, reject with a reason, confirm the rejected message and
  email and no login; register again with that email and confirm it is pending; open Zippy signed out and
  confirm the popup and a 401 from the route. One real n8n run per email type to an address Vishal owns.
- `npm run build` before done, plus lint and type-check.
- Curl checks for the role gates on every new admin and internal route.

## 12. Docs and rollout

Update `docs/User_Manual.docx` (sign-up, pending popup, admin Registrations page, Zippy sign-in
requirement), the in-app Help FAQ text where it describes sign-up, `knowledge/` Q&As (re-ingest, eval),
`docs/n8n-webhook-setup.md` (workflow 11, `APP_PUBLIC_URL`), CLAUDE.md, MEMORY.md and README.md.
Rollout order: migration 41, app code, import and publish workflow 11, set `APP_PUBLIC_URL`, live checks,
re-ingest knowledge. The phone manual changes belong to pieces 2 and 3.

## 13. Out of scope for piece 1

Delivery-partner or vendor approval, SMS or WhatsApp alerts, editing a pending request, bulk approve,
an approval audit export, and any phone-app change. The phone app keeps working with the old behaviour
only until piece 2 ships, so pieces 1 and 2 should be released together: after piece 1 alone, a phone
sign-up would show a generic failure on login and a visitor's Zippy request would get 401. Piece 1 is
therefore built and merged first but not announced for phone use until piece 2 is done.

## 14. Pieces 2 and 3 (outline only)

**Piece 2 (phone customer):** after sign-up show a modal with the same wording and do not sign in;
the customer login screen handles the banned error the same way through the status endpoint; the Zippy
button opens the same popup text for signed-out users and handles a 401 `login_required`; share the
status and message helpers byte-identical with web (parity-tested); phone manual and knowledge update.

**Piece 3 (phone admin):** an admin login and a Registrations screen on `/api/admin/registrations`
(pending count on the landing screen, Approve, Reject with a required reason); admin routes already
take a Bearer token. The plan must decide how the phone app separates the admin role from Customer and
Delivery, and must keep every admin route server-gated by `resolveAdmin`.
