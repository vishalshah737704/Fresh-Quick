# Customer registration approval, piece 3: phone admin area

Date: 2026-10-09. Follows `2026-10-08-registration-approval-design.md` (piece 1, web and backend) and
`2026-10-09-registration-approval-phone-design.md` (piece 2, phone customer). Both are merged to `main`.

## 1. Goal and success

Piece 1 gave the admin a web Registrations page. This piece lets an admin do the same from the phone: log
in, see how many registrations are waiting, and Approve or Reject each one (a rejection needs a reason).
A read-only Overview is the landing page.

Success: an admin can clear the pending queue from the phone with the same rules and wording as the web;
a non-admin account can never get past the admin login; every admin call is still gated server side by
`resolveAdmin`. No backend change.

## 2. Decisions already made (Vishal, 2026-10-09)

- Entry: a third button "Admin" on the phone role picker, next to Customer and Delivery Partner.
- Scope: Registrations plus a read-only Overview (no other admin pages, no auto-acceptance toggle).
- No backend change: reuse `GET /api/admin/registrations?view=pending|history`,
  `GET /api/admin/registrations/summary`, `POST /api/admin/registrations/:id/approve`,
  `POST /api/admin/registrations/:id/reject` (body `{reason}`), `GET /api/admin/orders`,
  `GET /api/admin/restaurants`. All take `Authorization: Bearer <access token>`.
- Local only; no public-launch hardening.

## 3. Role separation and navigation

- New `mobile/src/app/login/admin.tsx`, modelled on `login/delivery.tsx`: `signInWithPassword`, then read
  `users.role`; if it is not `admin`, sign out and show "This account is not an admin account." (the web
  admin login's text). A sign-in error goes through the shared `resolveLoginErrorText(message, null)`, so
  a banned account never shows the raw "User is banned".
- New route group `mobile/src/app/admin/` with a tab layout (Overview, Registrations). Every admin screen
  calls `useRequireSession("/login/admin")` (extend the hook's `loginRoute` union to include
  `"/login/admin"`).
- The role picker (`mobile/src/app/index.tsx`) gains the "Admin" button (`router.push("/login/admin")`).
- Authorization is server side. A customer who deep-links to an admin screen sees only 401/403 errors
  from the admin routes; the screens show those as a plain error line, never data. The role check at
  login is a courtesy, not the gate.
- Sign out: a "Sign out" action on the Overview screen (signs out, `router.replace("/")`).
- The root-layout Zippy button stays as is for signed-in users (admins may use it) and shows the
  signed-out popup otherwise; no admin-specific Zippy work.

## 4. Screens

**Overview** (landing tab). Tiles: "Registrations awaiting approval" (from `/summary`; tapping switches to
the Registrations tab), Active orders, Vendors, Revenue. Active orders, Vendors and Revenue come from
`/api/admin/orders` and `/api/admin/restaurants` exactly as the web Overview does (the web uses
`overviewStats(orders, vendorCount)` and `formatPaise`); revenue excludes cancelled and rejected orders.
Pull to refresh. If a call fails the tile keeps its last value and an error line shows.

**Registrations** tab. Pending and History segments. A card per row (full name, email, phone, address
line 1, city, pincode, "Registered <local date time>"; History rows add the decision, reason and review
time). Pending rows have Approve and Reject buttons. Rules, mirroring the web page after its fix wave:
- A "Loading registrations..." state before the empty text ("No registrations are waiting for approval."
  or "No decisions yet.").
- Poll every 30 s while the screen is focused and pull to refresh; stale responses are dropped by a
  request counter; switching segment resets rows and the loaded flag, and tapping the active segment is a
  no-op.
- One in-flight action at a time (per-row busy guard, ref plus state, buttons disabled while busy).
- Approve: `POST .../approve`, then reload. 409 shows "This request was already decided." and reloads.
- Reject: opens a modal with a multiline reason input, live validation through the shared
  `cleanRejectionReason` (required, trimmed, 1 to `REJECTION_REASON_MAX` = 500 characters, no control
  characters), Cancel and Reject buttons; a validation error shows inline and no request is sent.
  On success close the modal and reload; server errors show inline in the modal.
- Pending count badge on the Registrations tab icon (from `/summary`, refreshed with the screen).

## 5. Shared code (byte-identical, parity-tested)

`mobile/lib/registration-model.ts` already holds `cleanRejectionReason` and `REJECTION_REASON_MAX`.
`lib/registration-admin.ts` (row type and `shapeRegistrationRows`) and `lib/admin-order-view.ts`
(`overviewStats` and the normalizer) import nothing at runtime other than a type, so they are copied to
`mobile/lib/` byte-identical and guarded in `tests/mobile-parity.test.mjs`. The phone calls the API, which
already returns shaped rows, so the phone needs only the `RegistrationRow` type from the first and
`overviewStats` plus `AdminOrderRow` from the second. `formatPaise` already exists in
`mobile/lib/coupon-model.ts`. If a copy would need an extensionless runtime import (node cannot load it in
tests), the plan keeps the copy type-only or writes a small phone helper with its own test instead.

## 6. Payload note

Overview downloads every order to count active ones and sum revenue, as the web Overview does. That is
fine at this scale (the app is local and orders are reset regularly). A server-side summary endpoint
would be lighter but is a backend change and is explicitly not part of this piece.

## 7. Out of scope

Push notifications for new registrations, editing or bulk approval, the other admin pages (orders,
vendors, partners, coupons, reviews), the auto-acceptance toggle, and any web or backend change.

## 8. Testing

- Unit and parity: parity guards for the two new copies; pure tests for anything new that is pure.
- Source assertions for the screens (admin login role check and sign-out, role picker button, reject
  modal uses `cleanRejectionReason`, 409 handling, polling cleanup), matching how earlier phone work is
  tested.
- `npx tsc --noEmit` (root and `mobile`), eslint on changed files, `node --test tests/*.test.mjs`.
- Live on the Android emulator with a second Metro from the worktree on port 8082 (never touch the 8081
  Metro): admin login; a customer account refused on the admin login; Overview tiles match the web
  Overview; the pending queue shows throwaway registrations created by API; Approve; Reject with an empty
  reason (blocked) and with a reason; History shows decisions; a second admin-side decision on the same
  row gives the 409 text. Gmail workflow 11 is LIVE: every decision emails the customer, and every new registration emails the admin account's own address. Vishal's decision (2026-10-09): throwaway customers use plus-addresses of `vishalsshah555@outlook.com`; the admin auth email is temporarily set to that same address for the run (and restored to `admin@foodhub.local` afterwards) so the admin notifications stay in his inbox; one decision at a time; delete every throwaway user afterwards.
  Do not start n8n. The admin demo login is documented in README.
- Vishal's iPhone Expo Go check remains his step.

## 9. Docs

Phone manual (next version after v4.14): a new admin chapter (log in, Overview, Registrations, Reject
reason) with the TOC renumbered and the PDF regenerated; check `knowledge/` for phone-admin claims
(Zippy answers for customers; likely none); CLAUDE.md, MEMORY.md, README. Edit the manual in place with
python-docx.

## 10. Risks

- The role picker now shows "Admin" to every customer; the server gate and the login role check keep it
  harmless, but the manual should say it is for administrators only.
- Admin accounts sign in with the same GoTrue as customers; `useRequireSession` only checks that a
  session exists, so an admin screen opened by a signed-in customer renders an error line, not data.
- Android-only emulator verification; iOS Modal behaviour (the reject modal) needs Vishal's iPhone check.
- Gmail is live during the live checks (section 8).
