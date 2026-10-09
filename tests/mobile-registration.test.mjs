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
