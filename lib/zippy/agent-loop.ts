export type LoopMessage = { role: "user" | "assistant"; content: unknown };
export type Block = { type: string; [key: string]: unknown };
export type Round = { stopReason: string | null; content: Block[]; text: string };

export type LoopDeps = {
  initialMessages: LoopMessage[];
  maxToolRounds: number;
  maxToolCallsPerRound: number;
  toolsEnabled: boolean;
  runRound(messages: LoopMessage[], withTools: boolean): Promise<Round>;
  runTool(name: string, input: unknown): Promise<{ content: string; isError: boolean }>;
  onToolError?(name: string, error: unknown): void;
};

type ToolUse = { id: string; name: string; input: unknown };

// Bounded tool loop. Only the final round's text is ever yielded; text written in a round that ends
// in tool calls is discarded. The assistant turn (including thinking blocks) is passed back unchanged,
// and every tool result of a round goes back in ONE user message.
// The Messages API needs `tools` defined whenever the conversation holds tool_use/tool_result blocks.
export function hasToolBlocks(messages: LoopMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((b: Block | null) => b !== null && (b.type === "tool_use" || b.type === "tool_result"))
  );
}

export async function* runAgentLoop(deps: LoopDeps): AsyncGenerator<string> {
  const messages: LoopMessage[] = [...deps.initialMessages];
  let toolRounds = 0;
  for (;;) {
    const withTools = deps.toolsEnabled && toolRounds < deps.maxToolRounds;
    const round = await deps.runRound(messages, withTools);
    if (round.stopReason === "refusal") throw new Error("Anthropic refused to answer (stop_reason refusal)");
    const calls: ToolUse[] = withTools
      ? round.content
          .filter((b) => b.type === "tool_use")
          .map((b) => ({ id: String(b.id), name: String(b.name), input: b.input }))
      : [];
    if (calls.length === 0) {
      if (round.text.trim() === "") throw new Error("Model returned no text");
      yield round.text;
      return;
    }
    // A tool input cut off at max_tokens can parse as a valid partial object; never run it.
    if (round.stopReason === "max_tokens") throw new Error("Tool input truncated (stop_reason max_tokens)");
    messages.push({ role: "assistant", content: round.content });
    const results = await Promise.all(
      calls.map(async (call, index) => {
        if (index >= deps.maxToolCallsPerRound) {
          // Every tool_use id needs a result or the API rejects the next request.
          return {
            type: "tool_result",
            tool_use_id: call.id,
            content: "Too many lookups at once. Use the results you already have, or ask the user to narrow the request.",
            is_error: true,
          };
        }
        try {
          const r = await deps.runTool(call.name, call.input);
          return { type: "tool_result", tool_use_id: call.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
        } catch (error) {
          deps.onToolError?.(call.name, error);
          return {
            type: "tool_result",
            tool_use_id: call.id,
            content: "The live lookup failed. Tell the user you could not check live data right now.",
            is_error: true,
          };
        }
      })
    );
    messages.push({ role: "user", content: results });
    toolRounds += 1;
  }
}
