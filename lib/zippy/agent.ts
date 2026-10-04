import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hasToolBlocks, runAgentLoop, type AgentEvent, type Block, type LoopMessage, type Round } from "./agent-loop";
import { runTool, toolsFor } from "./tools";
import type { Point } from "./catalog";
import type { ActionCard, CartSnapshot } from "./action-types";

const MODEL = process.env.ZIPPY_CLAUDE_MODEL ?? "claude-sonnet-5-5";
const DEFAULT_TOOL_ROUNDS = 4;
const MAX_TOOL_CALLS_PER_ROUND = 6;

// Read at call time so the capped path can be exercised live with ZIPPY_MAX_TOOL_ROUNDS=1.
const maxToolRounds = () => {
  const n = Number.parseInt(process.env.ZIPPY_MAX_TOOL_ROUNDS ?? "", 10);
  return n >= 1 && n <= 6 ? n : DEFAULT_TOOL_ROUNDS;
};

let client: Anthropic | null = null;
const getClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  return client;
};

export async function* runAgent(args: {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  location: Point | null;
  customerId: string | null;
  ordersEnabled: boolean;
  actionsEnabled: boolean;
  cart: CartSnapshot | null;
  actions: ActionCard[];
  toolsEnabled: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<AgentEvent> {
  const anthropic = getClient();
  const context = {
    location: args.location,
    customerId: args.customerId,
    ordersEnabled: args.ordersEnabled,
    actionsEnabled: args.actionsEnabled,
    cart: args.cart,
    actions: args.actions,
  };
  const tools = toolsFor(context);
  const runRound = async (messages: LoopMessage[], withTools: boolean, onDelta: (text: string) => void): Promise<Round> => {
    try {
      // thinking "between_tools" turns thinking off on Sonnet 5.5; omitting it runs adaptive thinking at
      // effort high whose tokens count against max_tokens. The cast keeps this compiling on SDK versions
      // whose types predate the value.
      const params = {
        model: MODEL,
        max_tokens: 2000,
        thinking: { type: "between_tools" },
        system: args.system,
        messages,
        // Final forced-answer round: tool blocks in history still require `tools`; tool_choice none stops new calls.
        ...(withTools
          ? { tools }
          : hasToolBlocks(messages)
            ? { tools, tool_choice: { type: "none" } }
            : {}),
      } as unknown as Anthropic.MessageStreamParams;
      const stream = anthropic.messages.stream(params, { signal: args.signal });
      stream.on("text", (delta: string) => onDelta(delta));
      const message = await stream.finalMessage();
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { stopReason: message.stop_reason, content: message.content as unknown as Block[], text };
    } catch (error) {
      if (error instanceof Anthropic.APIError && !(error instanceof Anthropic.APIUserAbortError) && !args.signal?.aborted) {
        // Provider error bodies are logged server-side only (billing and key problems show up here).
        console.error("zippy: Anthropic request failed", error.status, JSON.stringify(error.error)?.slice(0, 500));
      }
      throw error;
    }
  };

  yield* runAgentLoop({
    initialMessages: args.messages,
    maxToolRounds: maxToolRounds(),
    maxToolCallsPerRound: MAX_TOOL_CALLS_PER_ROUND,
    toolsEnabled: args.toolsEnabled,
    runRound,
    runTool: (name, input) => runTool(name, input, context),
    onToolError: (name, error) => console.error(`zippy: tool ${name} failed`, error),
  });
}
