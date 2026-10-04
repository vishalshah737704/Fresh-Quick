import test from "node:test";
import assert from "node:assert/strict";
import * as web from "../lib/zippy/constants.ts";
import * as mobile from "../mobile/lib/zippy-constants.ts";
import { readFileSync } from "node:fs";
import { parseChatRequest } from "../lib/zippy/validate.ts";

test("web and mobile Zippy copy and limits are identical", () => {
  assert.deepEqual(mobile.ZIPPY_NAME, web.ZIPPY_NAME);
  assert.deepEqual(mobile.ZIPPY_WELCOME, web.ZIPPY_WELCOME);
  assert.deepEqual([...mobile.SUGGESTED_QUESTIONS], [...web.SUGGESTED_QUESTIONS]);
  assert.equal(mobile.MAX_MESSAGE_CHARS, web.MAX_MESSAGE_CHARS);
  assert.equal(mobile.MAX_HISTORY_MESSAGES, web.MAX_HISTORY_MESSAGES);
  assert.equal(mobile.ZIPPY_ERROR_MESSAGE, web.ZIPPY_ERROR_MESSAGE);
  assert.equal(mobile.RATE_LIMIT_MESSAGE, web.RATE_LIMIT_MESSAGE);
  assert.equal(mobile.SIGN_IN_AGAIN_MESSAGE, web.SIGN_IN_AGAIN_MESSAGE);
});

test("the server's message cap (validate.ts) matches the shared constant", () => {
  assert.equal(parseChatRequest({ message: "a".repeat(web.MAX_MESSAGE_CHARS) }).ok, true);
  assert.equal(parseChatRequest({ message: "a".repeat(web.MAX_MESSAGE_CHARS + 1) }).ok, false);
});

test("the server accepts the optional location the web client sends and ignores its absence (mobile sends none)", () => {
  assert.equal(parseChatRequest({ message: "near me?", location: { lat: 19.076, lng: 72.8777 } }).ok, true);
  assert.equal(parseChatRequest({ message: "hi", history: [], stream: false }).value.location, null);
});

test("mobile stream-events.ts is a byte-identical copy of the web one", () => {
  assert.equal(
    readFileSync(new URL("../mobile/lib/stream-events.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../lib/zippy/stream-events.ts", import.meta.url), "utf8"),
  );
});
