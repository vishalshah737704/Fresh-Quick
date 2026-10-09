import test from "node:test";
import assert from "node:assert/strict";
import { isLoginRequiredError } from "../lib/zippy-gate.ts";
import { ZIPPY_LOGIN_REQUIRED_MESSAGE } from "../lib/registration-model.ts";

test("only a 401 carrying the login-required text opens the popup", () => {
  assert.equal(isLoginRequiredError(401, ZIPPY_LOGIN_REQUIRED_MESSAGE, ZIPPY_LOGIN_REQUIRED_MESSAGE), true);
  assert.equal(isLoginRequiredError(401, "Please sign in again to keep chatting with Zippy.", ZIPPY_LOGIN_REQUIRED_MESSAGE), false);
  assert.equal(isLoginRequiredError(502, ZIPPY_LOGIN_REQUIRED_MESSAGE, ZIPPY_LOGIN_REQUIRED_MESSAGE), false);
});
