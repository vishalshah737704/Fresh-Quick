import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeIndianMobile, validateRecipientPhone } from "../lib/phone.ts";

test("valid formats normalize to +91XXXXXXXXXX", () => {
  for (const input of ["9876543210", "98765 43210", "+91 98765-43210", "09876543210", "919876543210", "(98765) 43210"]) {
    assert.equal(normalizeIndianMobile(input), "+919876543210", input);
    assert.equal(validateRecipientPhone(input), null, input);
  }
});

test("invalid numbers are rejected", () => {
  for (const input of ["", "   ", "12345", "5876543210", "98765432101", "abcdefghij", "+1 9876543210", "98765 4321"]) {
    assert.equal(normalizeIndianMobile(input), null, input);
    assert.match(validateRecipientPhone(input) ?? "", /valid 10-digit Indian mobile/, input);
  }
});

test("web and mobile validators are byte-identical", () => {
  const web = readFileSync(new URL("../lib/phone.ts", import.meta.url), "utf8");
  const mobile = readFileSync(new URL("../mobile/lib/phone.ts", import.meta.url), "utf8");
  assert.equal(mobile, web);
});
