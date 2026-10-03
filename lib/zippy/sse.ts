// Parses Anthropic Messages API server-sent events. Feed it the unconsumed
// remainder plus each new decoded chunk; it returns finished text deltas and
// the incomplete tail to carry into the next call. Malformed events are
// skipped rather than thrown so one bad frame cannot kill the stream.
export function extractTextDeltas(buffer: string): {
  texts: string[];
  rest: string;
  error?: string;
} {
  const events = buffer.split("\n\n");
  const rest = events.pop() ?? "";
  const texts: string[] = [];
  let error: string | undefined;
  for (const event of events) {
    const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(dataLine.slice(6));
    } catch {
      continue;
    }
    const obj = parsed as {
      type?: string;
      delta?: { type?: string; text?: string };
      error?: { message?: string };
    };
    if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta" && typeof obj.delta.text === "string") {
      texts.push(obj.delta.text);
    } else if (obj.type === "error") {
      error = obj.error?.message ?? "Unknown stream error";
    }
  }
  return { texts, rest, error };
}
