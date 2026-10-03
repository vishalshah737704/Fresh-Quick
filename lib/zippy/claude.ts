import "server-only";
import { extractTextDeltas } from "./sse";

export type ClaudeMessage = { role: "user" | "assistant"; content: string };

const MODEL = process.env.ZIPPY_CLAUDE_MODEL ?? "claude-sonnet-5-5";

export async function* streamClaude(
  system: string,
  messages: ClaudeMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    // thinking "between_tools" turns thinking off on Sonnet 5.5; otherwise adaptive thinking
    // tokens count against max_tokens and can truncate or empty the reply.
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: "between_tools" },
      system,
      messages,
      stream: true,
    }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Anthropic request failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let yielded = 0;
  let stopReason: string | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const parsed = extractTextDeltas(carry + decoder.decode(value, { stream: true }));
    carry = parsed.rest;
    if (parsed.stopReason) stopReason = parsed.stopReason;
    for (const text of parsed.texts) {
      yielded += 1;
      yield text;
    }
    if (parsed.error) throw new Error(`Anthropic stream error: ${parsed.error}`);
  }
  if (stopReason === "refusal") throw new Error("Anthropic refused to answer (stop_reason refusal)");
  if (yielded === 0) throw new Error("Anthropic stream produced no text");
}
