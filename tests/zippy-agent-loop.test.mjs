import test from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop, hasToolBlocks } from "../lib/zippy/agent-loop.ts";

const text = (t, stop = "end_turn") => ({ stopReason: stop, content: [{ type: "text", text: t }], text: t });
const toolRound = (calls, preamble = "") => ({
  stopReason: "tool_use",
  content: [
    { type: "thinking", thinking: "", signature: "s" },
    ...(preamble ? [{ type: "text", text: preamble }] : []),
    ...calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input ?? {} })),
  ],
  text: preamble,
});

async function collect(deps) {
  const out = [];
  for await (const piece of runAgentLoop({ initialMessages: [{ role: "user", content: "hi" }], maxToolRounds: 4, toolsEnabled: true, onToolError() {}, ...deps })) out.push(piece);
  return out;
}

test("no tool calls: yields the answer text once", async () => {
  const seen = [];
  const out = await collect({
    runRound: async (m, withTools) => { seen.push(withTools); return text("Hello"); },
    runTool: async () => { throw new Error("must not run"); },
  });
  assert.deepEqual(out, ["Hello"]);
  assert.deepEqual(seen, [true]);
});

test("tool round: preamble text is discarded, results go back in ONE user message, thinking blocks are passed back, final text yielded", async () => {
  const rounds = [
    toolRound([{ id: "a", name: "find_stores" }, { id: "b", name: "get_store_menu", input: { x: 1 } }], "Let me check that."),
    text("Dosa Corner is open."),
  ];
  const captured = [];
  const out = await collect({
    runRound: async (messages) => { captured.push(structuredClone(messages)); return rounds.shift(); },
    runTool: async (name) => ({ content: JSON.stringify({ name }), isError: false }),
  });
  assert.deepEqual(out, ["Dosa Corner is open."]);
  const second = captured[1];
  assert.equal(second.length, 3);
  assert.equal(second[1].role, "assistant");
  assert.equal(second[1].content[0].type, "thinking");
  assert.equal(second[2].role, "user");
  assert.equal(second[2].content.length, 2);
  assert.deepEqual(second[2].content.map((r) => r.tool_use_id), ["a", "b"]);
  assert.ok(second[2].content.every((r) => r.type === "tool_result"));
});

test("a throwing tool becomes an is_error result and the loop continues", async () => {
  const rounds = [toolRound([{ id: "a", name: "find_stores" }]), text("Sorry, could not check.")];
  const errors = [];
  let second;
  const out = await collect({
    onToolError: (name, e) => errors.push([name, e.message]),
    runRound: async (m) => { second = m; return rounds.shift(); },
    runTool: async () => { throw new Error("db down"); },
  });
  assert.deepEqual(out, ["Sorry, could not check."]);
  const result = second[2].content[0];
  assert.equal(result.is_error, true);
  assert.doesNotMatch(result.content, /db down/);
  assert.deepEqual(errors, [["find_stores", "db down"]]);
});

test("tool is_error results are marked is_error", async () => {
  const rounds = [toolRound([{ id: "a", name: "x" }]), text("ok")];
  let second;
  await collect({
    runRound: async (m) => { second = m; return rounds.shift(); },
    runTool: async () => ({ content: '{"error":"not found"}', isError: true }),
  });
  assert.equal(second[2].content[0].is_error, true);
});

test("round cap: after maxToolRounds the next call is made WITHOUT tools and must answer", async () => {
  const flags = [];
  let n = 0;
  const out = await collect({
    maxToolRounds: 2,
    runRound: async (m, withTools) => {
      flags.push(withTools);
      n += 1;
      return withTools ? toolRound([{ id: `t${n}`, name: "find_stores" }]) : text("Final answer");
    },
    runTool: async () => ({ content: "{}", isError: false }),
  });
  assert.deepEqual(out, ["Final answer"]);
  assert.deepEqual(flags, [true, true, false]);
});

test("toolsEnabled false: single call without tools", async () => {
  const flags = [];
  const out = await collect({
    toolsEnabled: false,
    runRound: async (m, withTools) => { flags.push(withTools); return text("Z1 style"); },
    runTool: async () => { throw new Error("no"); },
  });
  assert.deepEqual(out, ["Z1 style"]);
  assert.deepEqual(flags, [false]);
});

test("refusal never runs a pending tool and throws", async () => {
  await assert.rejects(
    collect({
      runRound: async () => ({ ...toolRound([{ id: "a", name: "find_stores" }]), stopReason: "refusal" }),
      runTool: async () => { throw new Error("must not run"); },
    }),
    /refus/i
  );
});

test("max_tokens with a pending tool call throws and runs nothing", async () => {
  await assert.rejects(
    collect({
      runRound: async () => ({ ...toolRound([{ id: "a", name: "find_stores" }]), stopReason: "max_tokens" }),
      runTool: async () => { throw new Error("must not run"); },
    }),
    /max_tokens|truncated/i
  );
});

test("an empty final answer throws", async () => {
  await assert.rejects(collect({ runRound: async () => text("   "), runTool: async () => ({ content: "", isError: false }) }), /no text|empty/i);
});

test("zero-row tool results are fine", async () => {
  const rounds = [toolRound([{ id: "a", name: "find_stores" }]), text("No stores match.")];
  const out = await collect({
    runRound: async () => rounds.shift(),
    runTool: async () => ({ content: '{"stores":[]}', isError: false }),
  });
  assert.deepEqual(out, ["No stores match."]);
});

test("hasToolBlocks detects tool_use and tool_result blocks only", () => {
  assert.equal(hasToolBlocks([]), false);
  assert.equal(hasToolBlocks([{ role: "user", content: "plain" }]), false);
  assert.equal(hasToolBlocks([{ role: "assistant", content: [{ type: "thinking" }, { type: "text", text: "x" }] }]), false);
  assert.equal(hasToolBlocks([{ role: "assistant", content: [{ type: "text", text: "x" }, { type: "tool_use", id: "1" }] }]), true);
  assert.equal(hasToolBlocks([{ role: "user", content: [{ type: "tool_result", tool_use_id: "1" }] }]), true);
});
