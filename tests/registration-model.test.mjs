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
