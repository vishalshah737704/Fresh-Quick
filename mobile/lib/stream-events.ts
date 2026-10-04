// Pure NDJSON event helpers for Ask Zippy streaming. No imports on purpose: node's test runner runs
// this file directly and mobile/lib/stream-events.ts is a byte-identical copy (parity test).
export type StreamEvent =
  | { t: "delta"; text: string }
  | { t: "reset" }
  | { t: "done"; reply: string; conversationId: string | null; actions: unknown[] }
  | { t: "error"; message: string };

export function encodeEvent(event: StreamEvent): string {
  return JSON.stringify(event) + "\n";
}

function toEvent(value: unknown): StreamEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  switch (v.t) {
    case "delta":
      return typeof v.text === "string" ? { t: "delta", text: v.text } : null;
    case "reset":
      return { t: "reset" };
    case "done":
      if (typeof v.reply !== "string") return null;
      return {
        t: "done",
        reply: v.reply,
        conversationId: typeof v.conversationId === "string" ? v.conversationId : null,
        actions: Array.isArray(v.actions) ? v.actions : [],
      };
    case "error":
      return typeof v.message === "string" ? { t: "error", message: v.message } : null;
    default:
      return null;
  }
}

// Feed chunks as they arrive; complete lines are parsed, a trailing partial line is buffered.
export function createLineParser(): (chunk: string) => StreamEvent[] {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    const events: StreamEvent[] = [];
    for (const line of lines) {
      if (line.trim() === "") continue;
      try {
        const event = toEvent(JSON.parse(line));
        if (event) events.push(event);
      } catch {
        // malformed line: skip
      }
    }
    return events;
  };
}
