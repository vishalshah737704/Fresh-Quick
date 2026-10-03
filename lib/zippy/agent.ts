import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop, type Block, type LoopMessage, type Round } from "./agent-loop";
import { runTool, ZIPPY_TOOLS } from "./tools";
import type { Point } from "./catalog";

const MODEL = process.env.ZIPPY_CLAUDE_MODEL ?? "claude-sonnet-5-5";
const MAX_TOOL_ROUNDS = 4;

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
  toolsEnabled: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const anthropic = getClient();
  const runRound = async (messages: LoopMessage[], withTools: boolean): Promise<Round> => {
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
        ...(withTools ? { tools: ZIPPY_TOOLS } : {}),
      } as unknown as Anthropic.MessageStreamParams;
      const stream = anthropic.messages.stream(params, { signal: args.signal });
      const message = await stream.finalMessage();
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { stopReason: message.stop_reason, content: message.content as unknown as Block[], text };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        // Provider error bodies are logged server-side only (billing and key problems show up here).
        console.error("zippy: Anthropic request failed", error.status, JSON.stringify(error.error)?.slice(0, 500));
      }
      throw error;
    }
  };

  yield* runAgentLoop({
    initialMessages: args.messages,
    maxToolRounds: MAX_TOOL_ROUNDS,
    toolsEnabled: args.toolsEnabled,
    runRound,
    runTool: (name, input) => runTool(name, input, { location: args.location }),
    onToolError: (name, error) => console.error(`zippy: tool ${name} failed`, error),
  });
}
