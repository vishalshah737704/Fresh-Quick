import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSignupFields, MIN_PASSWORD_LENGTH } from "../lib/signup-validation.ts";

test("MIN_PASSWORD_LENGTH is 6", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
});

test("rejects a too-short password", () => {
  assert.equal(
    validateSignupFields({ password: "12345" }, ["password"]),
    "password must be at least 6 characters"
  );
  assert.equal(
    validateSignupFields({ password: "a" }, ["password"]),
    "password must be at least 6 characters"
  );
});

test("accepts a password of exactly 6 characters", () => {
  assert.equal(validateSignupFields({ password: "123456" }, ["password"]), null);
});

test("201-char password still hits the 200 limit message", () => {
  assert.equal(
    validateSignupFields({ password: "a".repeat(201) }, ["password"]),
    "password must be under 200 characters"
  );
});

test("non-password fields are unaffected by the minimum", () => {
  assert.equal(
    validateSignupFields({ fullName: "A", password: "123456" }, ["fullName", "password"]),
    null
  );
});

test("missing or blank password reports required", () => {
  assert.equal(validateSignupFields({}, ["password"]), "password is required");
  assert.equal(validateSignupFields({ password: "   " }, ["password"]), "password is required");
});
