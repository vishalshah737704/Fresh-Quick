# Customer registration approval, piece 2: phone customer app

Date: 2026-10-09. Follows `2026-10-08-registration-approval-design.md` (piece 1, merged to `main`).
Piece 3 (phone admin area) is a separate cycle and is not part of this spec.

## 1. Goal and success

After piece 1 the backend and web require admin approval for new customers. The phone app still behaves
the old way: it signs a new customer in right after sign-up (which now fails), shows the raw GoTrue text
"User is banned" at login for a pending or rejected account, and lets a signed-out visitor open Zippy
(whose request now gets 401 `login_required`).

Success: on the phone, a customer never sees "User is banned"; sign-up does not log in and shows the same
popup wording as the web; login shows the same pending, rejected or fallback message as the web; a
signed-out user never gets a Zippy chat and sees the same sign-in-required text. No backend change.

## 2. Decisions already made

- Wording is the web's, byte for byte, from one shared model (no retyped strings or regexes).
- The phone calls the existing `POST /api/auth/registration-status` (public, rate limited) to learn why a
  login was refused; it never learns the rejection reason (that goes by email).
- Customers only. Delivery-partner login is unchanged (approval covers customers only).
- Local only; no public-launch hardening.

## 3. Shared code (byte-identical, parity-tested)

Copy to `mobile/lib/` exactly, and guard both in `tests/mobile-parity.test.mjs` (same mechanism as
`signup-validation.ts`):

- `lib/registration-model.ts` -> `mobile/lib/registration-model.ts` (message constants,
  `isBannedLoginError`, `loginBlockMessage`, `statusAnswer` types).
- `lib/zippy-gate.ts` -> `mobile/lib/zippy-gate.ts` (`isLoginRequiredError`).

Both import nothing at runtime. If `zippy-gate.ts` imports anything, the plan must resolve that before
copying (a pure file is required for the byte-identical rule).

## 4. Customer login screen (`mobile/src/app/login/customer.tsx`)

Sign-up (mode `signup`):
- On `apiPostPublic("/api/auth/signup", ...)` success the response is `{ok:true, status:"pending"}`.
  Do NOT call `signIn`. Show a modal containing `REGISTRATION_PENDING_POPUP` and one OK button. OK closes
  it, clears every sign-up field and returns to `login` mode. No session exists at this point.
- Errors keep the existing inline path (`ApiError.message`): this already shows the 409 texts
  "Your registration is already awaiting approval." and "An account with this email already exists.
  Please log in." and the geocode 400/503 messages.
- A rejected email registering again behaves like any sign-up (server re-registers it); the popup is the
  same.

Login (mode `login`):
- `signInWithPassword` error: if `isBannedLoginError(error.message)`, post
  `{ email }` to `/api/auth/registration-status` (no auth header; failure or non-ok means unknown).
  Show `loginBlockMessage(answer)` for `pending` or `rejected`; otherwise `LOGIN_BLOCKED_MESSAGE`.
  Any other error keeps showing GoTrue's own message (wrong password etc.). The lookup is awaited inside the same submit (`submitting` stays true until it
  finishes), so a double tap cannot start two.
- The decision (banned? lookup answer? message) is a small pure function in the shared model file or a
  new pure `mobile/lib/login-error.ts` guarded by a unit test; the screen only calls it.

## 5. Zippy on the phone (`mobile/components/ZippyFab.tsx`, `mobile/lib/zippy.ts`)

- The FAB already tracks the signed-in user id. When the user is signed out, tapping the button opens a
  small modal with `ZIPPY_LOGIN_REQUIRED_MESSAGE`, a Close button and a "Register or log in" button that
  navigates to the customer login screen and closes the modal. No chat window opens and no chat request
  is made.
- If a chat request answers 401 `login_required` (an expired session), clear the messages, close the
  chat and show the same modal (mirrors `ZippyWidget`'s use of `isLoginRequiredError(status, message,
  ZIPPY_LOGIN_REQUIRED_MESSAGE)`).
- Signing in while the modal is open closes it (as on web).
- Delivery-partner users are signed in and unaffected; visitors never reach the delivery FAB.

## 6. Out of scope

Backend, web, workflows, delivery-partner approval, push for approval events, piece 3.

## 7. Testing

- Unit/parity: new parity guards for the two shared files; a pure test for the login-error decision
  (banned + pending, banned + rejected, banned + none/fetch failure, non-banned error untouched).
- `npx tsc --noEmit` (root and mobile), eslint on changed files, `node --test tests/*.test.mjs`.
- Live on the Android emulator against the running stack (do not start n8n; Gmail workflows are live,
  so use throwaway `@foodhub.local` addresses only, never real mail): sign-up shows the popup and no
  session; pending login message; admin rejects (curl, admin token) then rejected message; sign-up again
  with the same email shows the popup; approve then login works; signed-out Zippy shows the popup and
  sends no request; expired-session 401 path where practical. Delete every throwaway user afterwards.
- Vishal's iPhone Expo Go check remains his step.

## 8. Docs

Phone manual `docs/Mobile_App_User_Manual.docx` to the next version (sign-up popup, login messages,
Zippy sign-in requirement) edited in place with the TOC renumbered and the PDF regenerated; check
`knowledge/customer/account-and-signin.md` and `ask-zippy.md` for phone-specific claims (re-ingest and
eval are Vishal's steps); CLAUDE.md, MEMORY.md, README.md. A release note: after this ships, pieces 1
and 2 are complete for customers.

## 9. Risks

- The phone modal and keyboard behaviour differ between Android and iOS: verify the modal on the emulator
  and ask Vishal to confirm on the iPhone.
- `zippy-gate.ts` purity (section 3).
- The status lookup is rate limited (20 per minute per IP by default); a refused lookup falls back to
  `LOGIN_BLOCKED_MESSAGE`, never to the raw text.
