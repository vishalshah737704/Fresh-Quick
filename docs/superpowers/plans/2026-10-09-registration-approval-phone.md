# Registration Approval, Piece 2 (Phone Customer App) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the phone Customer app follow piece 1's registration approval: sign-up shows a pending popup and does not log in, a refused login shows the pending or rejected message (never "User is banned"), and a signed-out Zippy tap shows the sign-in-required popup.

**Architecture:** Add two tiny pure helpers to the existing shared model `lib/registration-model.ts`, use them from the web login page, then copy `lib/registration-model.ts` and `lib/zippy-gate.ts` byte-identical to `mobile/lib/` (parity-tested). The phone login screen and the Zippy button then use the shared wording; one small phone helper calls the existing `POST /api/auth/registration-status`. No backend change.

**Tech Stack:** Expo SDK 57 / React Native / expo-router (phone), Next.js (web), `node --test` with type stripping.

**Spec:** `docs/superpowers/specs/2026-10-09-registration-approval-phone-design.md`

## Global Constraints

- Wording is the web's byte for byte; never retype a message string or the banned regex in phone code.
- Pure shared files import nothing at runtime (`node --test` loads them directly) and are copied byte-identical to `mobile/lib/`; `tests/mobile-parity.test.mjs` guards the copy.
- Mobile lib files that tests import must not import other files with extensionless runtime imports (node cannot resolve them); type-only imports are fine. Phone files that import `./api`, `./supabase` or `react-native` are tested by source assertions, not imported.
- Indent 2 spaces, ES modules, `async/await`, descriptive names, comments only for a non-obvious WHY.
- No backend, web-visible-behavior or workflow change. No package installs. Delivery-partner login is unchanged.
- Gmail is LIVE: live checks use only throwaway `@foodhub.local` addresses; never start n8n or `npm run app:start`; do not read or print `.env*` values; delete every throwaway user afterwards; check what owns a port before stopping it and never stop the running dev servers or Metro.
- Stage files by name; never `git add -A`; never stage `.claude/`, `.superpowers/`, `md_version/`, MP4 files.
- Run all commands from the worktree `C:\Vishal\Projects\FoodDelivery_App_WebSite\.claude\worktrees\approval-phone` (branch `approval-phone`).

## Review Focus

- Wrong password at login must still show GoTrue's own message ("Invalid login credentials"), not the blocked text. Test: `resolveLoginErrorText("Invalid login credentials", "pending")` returns the raw message.
- A failed, non-OK, garbled or rate-limited status lookup must give `LOGIN_BLOCKED_MESSAGE`, never "User is banned". Test: `resolveLoginErrorText("User is banned", null)`; `parseStatusAnswer` of junk returns `null`.
- A double tap on Sign Up must not post twice (existing `submitting` guard stays) and the success path must not call `signIn`. Test: source assertion that the old `signIn(mode === "signup" ? ...)` line is gone.
- A signed-out Zippy tap must not open the chat or send a request; an expired-session 401 (different text from the login-required text) must keep its own message. Test: `isLoginRequiredError(401, "Please sign in again…", ZIPPY_LOGIN_REQUIRED_MESSAGE)` is false; source assertion that the button checks the session before `setOpen(true)`.
- The 409 texts ("already awaiting approval", "already exists") must still show inline after sign-up. Test: source assertion that the `ApiError` message path is kept.

---

### Task 1: Shared helpers, web login page, byte-identical copies

**Files:**
- Modify: `lib/registration-model.ts` (append two functions)
- Modify: `app/customer/login/page.tsx` (use the helpers; imports)
- Create: `mobile/lib/registration-model.ts` (byte copy)
- Create: `mobile/lib/zippy-gate.ts` (byte copy)
- Modify: `tests/mobile-parity.test.mjs` (two guard lines)
- Modify: `tests/registration-model.test.mjs` (new tests)

**Interfaces:**
- Produces (in `lib/registration-model.ts` and its mobile copy):
  - `resolveLoginErrorText(rawMessage: string, answer: RegistrationStatusAnswer | null): string`
  - `parseStatusAnswer(json: unknown): RegistrationStatusAnswer | null`
- Consumes: existing `isBannedLoginError`, `loginBlockMessage`, `LOGIN_BLOCKED_MESSAGE`, `RegistrationStatusAnswer`.

- [ ] **Step 1: Worktree environment (controller does this before dispatch; implementer only verifies)**

Run: `ls .env.local node_modules mobile/node_modules >/dev/null 2>&1 && echo ready`
Expected: `ready`. If missing, stop and report BLOCKED (the controller creates a copy of `.env.local` and junctions `node_modules` and `mobile/node_modules` to the main checkout's folders).

- [ ] **Step 2: Write the failing tests** in `tests/registration-model.test.mjs`. Add to the import list `resolveLoginErrorText, parseStatusAnswer` (from `../lib/registration-model.ts`), then append:

```js
test("resolveLoginErrorText keeps non-banned errors and never shows the raw banned text", () => {
  assert.equal(resolveLoginErrorText("Invalid login credentials", "pending"), "Invalid login credentials");
  assert.equal(resolveLoginErrorText("User is banned", "pending"), LOGIN_PENDING_MESSAGE);
  assert.equal(resolveLoginErrorText("User is banned", "rejected"), LOGIN_REJECTED_MESSAGE);
  assert.equal(resolveLoginErrorText("User is banned", "none"), LOGIN_BLOCKED_MESSAGE);
  assert.equal(resolveLoginErrorText("User is banned", null), LOGIN_BLOCKED_MESSAGE);
});

test("parseStatusAnswer accepts only the three known answers", () => {
  assert.equal(parseStatusAnswer({ status: "pending" }), "pending");
  assert.equal(parseStatusAnswer({ status: "rejected" }), "rejected");
  assert.equal(parseStatusAnswer({ status: "none" }), "none");
  for (const junk of [null, undefined, 5, "pending", {}, { status: "approved" }, { status: 3 }, []]) {
    assert.equal(parseStatusAnswer(junk), null, JSON.stringify(junk));
  }
});
```

Also add `LOGIN_BLOCKED_MESSAGE` to the import list only if it is not already imported there.

- [ ] **Step 3: Run to verify failure**

Run: `node --test tests/registration-model.test.mjs`
Expected: FAIL (the two functions are not exported).

- [ ] **Step 4: Implement.** Append to the end of `lib/registration-model.ts`:

```ts

// What a login failure should show: GoTrue's own text for everything except a banned account, where
// the status lookup decides (pending or rejected) and anything unknown gets the friendly fallback.
export function resolveLoginErrorText(rawMessage: string, answer: RegistrationStatusAnswer | null): string {
  if (!isBannedLoginError(rawMessage)) return rawMessage;
  return loginBlockMessage(answer ?? "none") ?? LOGIN_BLOCKED_MESSAGE;
}

export function parseStatusAnswer(json: unknown): RegistrationStatusAnswer | null {
  const value = json && typeof json === "object" ? (json as { status?: unknown }).status : undefined;
  return value === "pending" || value === "rejected" || value === "none" ? value : null;
}
```

- [ ] **Step 5: Use the helpers on the web login page.** In `app/customer/login/page.tsx` replace the `if (signInError) { ... }` block inside `handleLogin` with:

```tsx
    if (signInError) {
      let answer = null;
      if (isBannedLoginError(signInError.message)) {
        const res = await fetch("/api/auth/registration-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => null);
        answer = parseStatusAnswer(res && res.ok ? await res.json().catch(() => null) : null);
      }
      setError(resolveLoginErrorText(signInError.message, answer));
      return;
    }
```

Update the import from `@/lib/registration-model` in that file: remove `loginBlockMessage` and `LOGIN_BLOCKED_MESSAGE` if they are no longer used there, add `parseStatusAnswer` and `resolveLoginErrorText`; keep `REGISTRATION_PENDING_POPUP` and `isBannedLoginError`. (Check the whole file with eslint; do not leave unused imports.)

- [ ] **Step 6: Copy the shared files byte-identical**

Run:
```
cp lib/registration-model.ts mobile/lib/registration-model.ts
cp lib/zippy-gate.ts mobile/lib/zippy-gate.ts
```

- [ ] **Step 7: Add the parity guards.** In `tests/mobile-parity.test.mjs`, inside the same test that has `assert.equal(read("../mobile/lib/notify-model.ts"), read("../lib/notify-model.ts"));`, add after it:

```js
  assert.equal(read("../mobile/lib/registration-model.ts"), read("../lib/registration-model.ts"));
  assert.equal(read("../mobile/lib/zippy-gate.ts"), read("../lib/zippy-gate.ts"));
```

- [ ] **Step 8: Run all checks**

Run: `node --test tests/*.test.mjs`, `npx tsc --noEmit`, `npx eslint app/customer/login/page.tsx lib/registration-model.ts`
Expected: all pass; the full suite count rises by 2 plus nothing failing (583 + 2 = 585).

- [ ] **Step 9: Commit**

```bash
git add lib/registration-model.ts app/customer/login/page.tsx mobile/lib/registration-model.ts mobile/lib/zippy-gate.ts tests/mobile-parity.test.mjs tests/registration-model.test.mjs
git commit -m "feat(approval-phone): shared login-error helpers, phone copies of the registration model and zippy gate

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Phone customer login and sign-up screen

**Files:**
- Create: `mobile/lib/registration-status.ts`
- Modify: `mobile/src/app/login/customer.tsx`
- Create: `tests/mobile-registration.test.mjs`

**Interfaces:**
- Consumes: `isBannedLoginError`, `resolveLoginErrorText`, `parseStatusAnswer`, `REGISTRATION_PENDING_POPUP`, `RegistrationStatusAnswer` from `mobile/lib/registration-model.ts`; `apiPostPublic` from `mobile/lib/api.ts`.
- Produces: `fetchRegistrationStatus(email: string): Promise<RegistrationStatusAnswer | null>` (never throws).

- [ ] **Step 1: Write the failing source tests.** Create `tests/mobile-registration.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("registration status helper posts to the public endpoint and never throws", () => {
  const source = read("../mobile/lib/registration-status.ts");
  assert.match(source, /\/api\/auth\/registration-status/);
  assert.match(source, /apiPostPublic/);
  assert.match(source, /parseStatusAnswer/);
  assert.match(source, /catch/);
});

test("phone sign-up shows the pending popup and does not sign in", () => {
  const screen = read("../mobile/src/app/login/customer.tsx");
  assert.match(screen, /REGISTRATION_PENDING_POPUP/);
  assert.doesNotMatch(screen, /mode === "signup" \? trimmedEmail : email/);
  assert.match(screen, /signupError\.message/);
});

test("phone login maps a banned error through the shared resolver, not raw text", () => {
  const screen = read("../mobile/src/app/login/customer.tsx");
  assert.match(screen, /isBannedLoginError\(signInError\.message\)/);
  assert.match(screen, /fetchRegistrationStatus/);
  assert.match(screen, /resolveLoginErrorText\(signInError\.message/);
  assert.doesNotMatch(screen, /setError\(signInError\.message\)/);
});

test("phone login screen has no hand-typed registration wording", () => {
  const screen = read("../mobile/src/app/login/customer.tsx");
  assert.doesNotMatch(screen, /awaiting admin approval/);
  assert.doesNotMatch(screen, /approval is in progress/);
  assert.doesNotMatch(screen, /\/banned\/i/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/mobile-registration.test.mjs`
Expected: FAIL (helper file missing; screen unchanged).

- [ ] **Step 3: Create the helper** `mobile/lib/registration-status.ts`:

```ts
import { apiPostPublic } from "./api";
import { parseStatusAnswer, type RegistrationStatusAnswer } from "./registration-model";

// Why was this login refused? null means the lookup failed or answered something unexpected;
// the caller then shows the friendly fallback, never the raw sign-in error.
export async function fetchRegistrationStatus(email: string): Promise<RegistrationStatusAnswer | null> {
  try {
    return parseStatusAnswer(await apiPostPublic<unknown>("/api/auth/registration-status", { email }));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Edit `mobile/src/app/login/customer.tsx`.**

(a) Replace the file's header comment (lines 10-14) with:

```tsx
// Mirrors app/customer/login/page.tsx on the web: email/password sign-in against Supabase Auth, plus a
// Sign up mode that posts to the public /api/auth/signup route. Sign-up does not sign the customer in:
// the account waits for admin approval, so a popup says so (same wording as the web). A refused login
// asks /api/auth/registration-status why and shows the shared pending / rejected message.
```

(b) Imports: change the react-native import to add `Modal, View`; add below the `signup-validation` import:

```tsx
import { REGISTRATION_PENDING_POPUP, isBannedLoginError, resolveLoginErrorText } from "../../../lib/registration-model";
import { fetchRegistrationStatus } from "../../../lib/registration-status";
```

(c) After `const [submitting, setSubmitting] = useState(false);` add:

```tsx
  const [showPendingPopup, setShowPendingPopup] = useState(false);
```

(d) Replace `signIn` with:

```tsx
  async function signIn(trimmedEmail: string) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (signInError) {
      const answer = isBannedLoginError(signInError.message) ? await fetchRegistrationStatus(trimmedEmail) : null;
      setError(resolveLoginErrorText(signInError.message, answer));
      return;
    }
    router.replace("/customer/home");
  }

  function dismissPendingPopup() {
    setShowPendingPopup(false);
    setFullName("");
    setEmail("");
    setPassword("");
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

(e) In `handleSubmit`, replace the block from `if (mode === "signup") {` (the one containing `await apiPostPublic`) through the final `await signIn(...)` line with:

```tsx
      if (mode === "signup") {
        try {
          await apiPostPublic("/api/auth/signup", {
            email: trimmedEmail,
            password,
            fullName: trimmedName,
            phone: phone.trim(),
            referralCode: referralCode.trim() === "" ? undefined : referralCode.trim(),
            address: {
              line1: line1.trim(),
              line2: line2.trim(),
              city: city.trim(),
              state: state.trim(),
              pincode: pincode.trim(),
            },
          });
        } catch (signupError) {
          if (signupError instanceof ApiError) {
            setError(signupError.message || "Signup failed");
          } else {
            setError("Could not reach the server");
          }
          return;
        }
        // The account is pending admin approval: no session, so do not sign in.
        setShowPendingPopup(true);
        return;
      }
      await signIn(email.trim());
```

(f) Immediately after `<KeyboardAvoidingView ...>` opening... no: add the popup as the first child inside the outer `KeyboardAvoidingView`, before `<ScrollView`:

```tsx
      <Modal visible={showPendingPopup} transparent animationType="fade" statusBarTranslucent onRequestClose={dismissPendingPopup}>
        <View style={styles.backdrop}>
          <View style={styles.popup}>
            <Text style={styles.popupText}>{REGISTRATION_PENDING_POPUP}</Text>
            <Pressable style={styles.button} onPress={dismissPendingPopup} accessibilityRole="button">
              <Text style={styles.buttonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
```

(g) Add to `StyleSheet.create`:

```tsx
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  popup: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 20,
    gap: 12,
  },
  popupText: {
    color: BRAND.colors.ink,
    fontFamily: BRAND.fonts.body,
    fontSize: 16,
  },
```

- [ ] **Step 5: Run checks**

Run: `node --test tests/*.test.mjs`; `cd mobile && npx tsc --noEmit && cd ..`; `npx eslint mobile/src/app/login/customer.tsx mobile/lib/registration-status.ts` (use the repo's eslint config; if the mobile folder has its own, use that).
Expected: all pass (suite 589 = 585 + 4).

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/registration-status.ts mobile/src/app/login/customer.tsx tests/mobile-registration.test.mjs
git commit -m "feat(approval-phone): sign-up pending popup and shared login messages on the phone

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Zippy button for signed-out users

**Files:**
- Modify: `mobile/components/ZippyFab.tsx`
- Modify: `tests/mobile-registration.test.mjs` (append tests)

**Interfaces:**
- Consumes: `ZIPPY_LOGIN_REQUIRED_MESSAGE` from `mobile/lib/registration-model.ts`; `isLoginRequiredError(status: number, message: string, loginRequiredText: string): boolean` from `mobile/lib/zippy-gate.ts`; `router` from `expo-router`; `ZippyError` (has `.status`, `.message`) already imported.

- [ ] **Step 1: Write the failing tests.** Append to `tests/mobile-registration.test.mjs`:

```js
import { ZIPPY_LOGIN_REQUIRED_MESSAGE } from "../mobile/lib/registration-model.ts";
import { isLoginRequiredError } from "../mobile/lib/zippy-gate.ts";

test("only the login-required 401 triggers the popup; an expired session keeps its own message", () => {
  assert.equal(isLoginRequiredError(401, ZIPPY_LOGIN_REQUIRED_MESSAGE, ZIPPY_LOGIN_REQUIRED_MESSAGE), true);
  assert.equal(isLoginRequiredError(401, "Please sign in again to keep chatting with Zippy.", ZIPPY_LOGIN_REQUIRED_MESSAGE), false);
  assert.equal(isLoginRequiredError(500, ZIPPY_LOGIN_REQUIRED_MESSAGE, ZIPPY_LOGIN_REQUIRED_MESSAGE), false);
});

test("Zippy button checks the session before opening and shows the shared popup text", () => {
  const fab = read("../mobile/components/ZippyFab.tsx");
  assert.match(fab, /supabase\.auth\.getSession\(\)/);
  assert.match(fab, /setShowLoginPopup\(true\)/);
  assert.match(fab, /ZIPPY_LOGIN_REQUIRED_MESSAGE/);
  assert.match(fab, /isLoginRequiredError\(error\.status, error\.message, ZIPPY_LOGIN_REQUIRED_MESSAGE\)/);
  assert.match(fab, /if \(next\) setShowLoginPopup\(false\)/);
  assert.doesNotMatch(fab, /onPress=\{\(\) => setOpen\(true\)\}/);
});
```

(The imports go at the top of the file with the others; ES module imports are hoisted.)

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/mobile-registration.test.mjs`
Expected: the new FAB test fails; the gate test passes.

- [ ] **Step 3: Edit `mobile/components/ZippyFab.tsx`.**

(a) Add imports after the `supabase` import:

```tsx
import { router } from "expo-router";
import { ZIPPY_LOGIN_REQUIRED_MESSAGE } from "../lib/registration-model";
import { isLoginRequiredError } from "../lib/zippy-gate";
```

(b) After `const [userId, setUserId] = useState<string | null>(null);` add:

```tsx
  const [showLoginPopup, setShowLoginPopup] = useState(false);
```

(c) In the `applyUser` function add one line after `setUserId(next);`:

```tsx
      if (next) setShowLoginPopup(false);
```

(d) In `send`'s `catch (error)` block, after `if (token !== requestToken.current) return;` insert:

```tsx
      if (error instanceof ZippyError && isLoginRequiredError(error.status, error.message, ZIPPY_LOGIN_REQUIRED_MESSAGE)) {
        reset();
        setOpen(false);
        setShowLoginPopup(true);
        return;
      }
```

(e) Replace the floating button's `onPress={() => setOpen(true)}` with:

```tsx
        onPress={async () => {
          const { data } = await supabase.auth.getSession();
          if (data.session) setOpen(true);
          else setShowLoginPopup(true);
        }}
```

(f) Directly after the closing `</Pressable>` of that floating button (before `<Modal visible={open} ...`) insert:

```tsx
      <Modal visible={showLoginPopup} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowLoginPopup(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: BRAND.colors.surface, borderRadius: BRAND.radius, padding: 20, gap: 14 }}>
            <Text style={{ color: BRAND.colors.ink, fontFamily: BRAND.fonts.body, fontSize: 16 }}>{ZIPPY_LOGIN_REQUIRED_MESSAGE}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowLoginPopup(false)}
                style={{ borderWidth: 1, borderColor: BRAND.colors.inkMuted, borderRadius: BRAND.radiusPill, paddingHorizontal: 16, paddingVertical: 10 }}
              >
                <Text style={{ color: BRAND.colors.ink, fontFamily: BRAND.fonts.bodySemiBold }}>Close</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setShowLoginPopup(false);
                  router.push("/login/customer");
                }}
                style={{ backgroundColor: BRAND.colors.primaryTextSafe, borderRadius: BRAND.radiusPill, paddingHorizontal: 16, paddingVertical: 10 }}
              >
                <Text style={{ color: "#fff", fontFamily: BRAND.fonts.bodySemiBold }}>Register or log in</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
```

- [ ] **Step 4: Run checks**

Run: `node --test tests/*.test.mjs`; `cd mobile && npx tsc --noEmit && cd ..`; `npx eslint mobile/components/ZippyFab.tsx`
Expected: all pass (suite 591).

- [ ] **Step 5: Commit**

```bash
git add mobile/components/ZippyFab.tsx tests/mobile-registration.test.mjs
git commit -m "feat(approval-phone): signed-out Zippy tap shows the sign-in-required popup

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Live verification on the Android emulator (controller runs this, not a subagent)

**Files:** none changed (fixes, if any, get their own commits).

- [ ] **Step 1: Preconditions.** Supabase, the four dev servers on 3000-3003 and Metro (8081) are up (`docker ps`, port check). Metro serves the MAIN checkout, not the worktree, so the phone code under test must be reachable: either ask Vishal's go-ahead to merge to `main` first, or run a SECOND Metro from the worktree on port 8082 (check that 8082 is free; never stop the 8081 Metro) with `EXPO_PUBLIC_API_BASE_URL` pointing at the running app. Say which one was used in the report.
- [ ] **Step 2: Walk the flows** on the emulator (`.\scripts\start-emulator.ps1`, open the customer login): (1) sign-up with a throwaway `zzphone1@foodhub.local` shows the popup text exactly, no session, OK returns to Log in with empty fields; (2) log in as that user: pending message; (3) reject it with curl (admin token from local GoTrue, `POST /api/admin/registrations/:id/reject` with a reason) then log in: rejected message; (4) sign up again with the same email: popup again (re-register); (5) approve with curl, log in: lands on the customer home; (6) wrong password shows "Invalid login credentials"; (7) signed out, tap the Zippy button: popup text exactly, Close dismisses, "Register or log in" opens the customer login; no request in the app log; (8) signed in, the chat opens as before.
- [ ] **Step 3: Cleanup.** Delete the throwaway users (`delete from auth.users where email like 'zzphone%'`), clear the emulator's Expo Go data only if Vishal's Reset-style rule applies (not needed here), stop only processes you started (a second Metro on 8082, the emulator if you booted it).
- [ ] **Step 4: Record results** in the ledger (what passed, what was not driven).

---

### Task 5: Documentation, knowledge check, memory docs

**Files:**
- Modify: `docs/Mobile_App_User_Manual.docx` and `docs/Mobile_App_User_Manual.pdf` (in place, python-docx)
- Check/modify: `knowledge/customer/account-and-signin.md`, `knowledge/customer/ask-zippy.md`
- Modify: `CLAUDE.md`, `MEMORY.md`, `README.md` (`AGENTS.md` and `rules.md` do not exist here)

- [ ] **Step 1: Phone manual** to the next version (currently v4.13 -> v4.14): sign-up popup (exact text), login messages (pending, rejected, not-active fallback), re-registering a rejected email, Zippy sign-in requirement (popup text, Close, Register or log in). Verify every sentence against the code and the shared model; edit in place with python-docx; renumber the hand-typed TOC after converting to PDF with `C:\Program Files\LibreOffice\program\soffice.exe --headless --convert-to pdf`; regenerate the PDF; confirm each TOC page number matches the rendered PDF. Text only; add a figure only if Task 4 produced a clean emulator screenshot of the popup.
- [ ] **Step 2: Knowledge check.** Read the two knowledge files; fix any claim that says the phone shows "User is banned", signs in after sign-up, or lets visitors chat. Report whether a re-ingest is needed (Vishal runs it with `N8N_INTERNAL_SECRET` and then `node scripts/zippy-eval.mjs`).
- [ ] **Step 3: Memory docs.** CLAUDE.md: extend the piece 1 paragraph ("Customer registration approval, piece 1") with a piece 2 paragraph (what shipped, the shared files, live results from Task 4, what is not driven, remaining: iPhone check and piece 3). MEMORY.md: a piece 2 entry. README.md: remove "The phone app still shows 'User is banned'..." and say the phone now follows approval.
- [ ] **Step 4: Verify and commit.**

Run: `node --test tests/*.test.mjs`; `git status --short`.
Commit by name:

```bash
git add docs/Mobile_App_User_Manual.docx docs/Mobile_App_User_Manual.pdf CLAUDE.md MEMORY.md README.md
git add knowledge/customer/account-and-signin.md knowledge/customer/ask-zippy.md   # only if changed
git commit -m "docs(approval-phone): phone manual v4.14, knowledge and memory docs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Then push the branch: `git push -u origin approval-phone`. Merging to `main` waits for Vishal's "Commit Work".

---

## Self-review (done)

- **Spec coverage:** shared copies and parity (Task 1), sign-up popup and no auto-login, login messages, status lookup, double-tap guard (Task 2), Zippy popup and 401 handling (Task 3), live checks (Task 4), docs (Task 5). The spec's separate `login-error.ts` was replaced by the shared `resolveLoginErrorText`, which keeps one tested decision for web and phone.
- **Placeholder scan:** none; every code step has full code.
- **Type consistency:** `resolveLoginErrorText`, `parseStatusAnswer`, `fetchRegistrationStatus`, `isLoginRequiredError`, `ZIPPY_LOGIN_REQUIRED_MESSAGE` are named identically in every task.
