import test from "node:test";
import assert from "node:assert/strict";
import { parseBearer, parseChatRequest } from "../lib/zippy/validate.ts";

test("parseBearer distinguishes no header, a token, and junk", () => {
  assert.deepEqual(parseBearer(null), { kind: "none" });
  assert.deepEqual(parseBearer("Bearer abc.def"), { kind: "token", token: "abc.def" });
  assert.deepEqual(parseBearer("bearer abc"), { kind: "token", token: "abc" });
  assert.deepEqual(parseBearer("Bearer "), { kind: "malformed" });
  assert.deepEqual(parseBearer("Basic abc"), { kind: "malformed" });
  assert.deepEqual(parseBearer(""), { kind: "none" });
});

test("parseChatRequest accepts a minimal valid body", () => {
  const r = parseChatRequest({ message: "  How do I order?  " });
  assert.equal(r.ok, true);
  assert.equal(r.value.message, "How do I order?");
  assert.equal(r.value.conversationId, null);
  assert.deepEqual(r.value.history, []);
  assert.equal(r.value.stream, true);
});

test("parseChatRequest rejects bad messages with a clear error", () => {
  for (const body of [null, "x", [], {}, { message: 5 }, { message: "" }, { message: "   " }]) {
    const r = parseChatRequest(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.ok(typeof r.error === "string" && r.error.length > 0);
  }
  assert.equal(parseChatRequest({ message: "a".repeat(1001) }).ok, false);
  assert.equal(parseChatRequest({ message: "a".repeat(1000) }).ok, true);
});

test("parseChatRequest validates conversationId and history shape", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(parseChatRequest({ message: "hi", conversationId: id }).value.conversationId, id);
  assert.equal(parseChatRequest({ message: "hi", conversationId: "nope" }).ok, false);
  assert.equal(parseChatRequest({ message: "hi", history: "x" }).ok, false);
  assert.equal(parseChatRequest({ message: "hi", history: [{ role: "user" }] }).ok, false);
  const ok = parseChatRequest({
    message: "hi",
    stream: false,
    history: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }],
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.stream, false);
  assert.equal(ok.value.history.length, 2);
});
