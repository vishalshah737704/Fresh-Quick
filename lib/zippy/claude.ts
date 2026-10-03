import "server-only";
import { extractTextDeltas } from "./sse";

export type ClaudeMessage = { role: "user" | "assistant"; content: string };

const MODEL = process.env.ZIPPY_CLAUDE_MODEL ?? "claude-sonnet-5-5";

export async function* streamClaude(
  system: string,
  messages: ClaudeMessage[]
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
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Anthropic request failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const parsed = extractTextDeltas(carry + decoder.decode(value, { stream: true }));
    carry = parsed.rest;
    for (const text of parsed.texts) yield text;
    if (parsed.error) throw new Error(`Anthropic stream error: ${parsed.error}`);
  }
}
