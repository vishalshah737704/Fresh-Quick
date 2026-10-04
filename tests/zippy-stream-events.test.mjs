import test from "node:test";
import assert from "node:assert/strict";
import { encodeEvent, createLineParser } from "../lib/zippy/stream-events.ts";

test("encodeEvent is one JSON line", () => {
  const line = encodeEvent({ t: "delta", text: "hi\nthere" });
  assert.equal(line.endsWith("\n"), true);
  assert.equal(line.split("\n").length, 2);
  assert.deepEqual(JSON.parse(line), { t: "delta", text: "hi\nthere" });
});

test("parser handles lines split across chunks", () => {
  const parse = createLineParser();
  const whole = encodeEvent({ t: "delta", text: "abc" }) + encodeEvent({ t: "reset" });
  assert.deepEqual(parse(whole.slice(0, 10)), []);
  assert.deepEqual(parse(whole.slice(10)), [{ t: "delta", text: "abc" }, { t: "reset" }]);
});

test("parser skips malformed lines and ignores unknown types", () => {
  const parse = createLineParser();
  const out = parse('not json\n{"t":"mystery"}\n{"t":"delta"}\n\n{"t":"delta","text":"ok"}\n');
  assert.deepEqual(out, [{ t: "delta", text: "ok" }]);
});

test("done carries reply, conversationId and actions", () => {
  const parse = createLineParser();
  const actions = [{ kind: "x" }];
  const [event] = parse(encodeEvent({ t: "done", reply: "full", conversationId: "c1", actions }));
  assert.deepEqual(event, { t: "done", reply: "full", conversationId: "c1", actions });
  const [bare] = parse('{"t":"done","reply":"r"}\n');
  assert.deepEqual(bare, { t: "done", reply: "r", conversationId: null, actions: [] });
});

test("error event parses", () => {
  const parse = createLineParser();
  assert.deepEqual(parse(encodeEvent({ t: "error", message: "oops" })), [{ t: "error", message: "oops" }]);
});
