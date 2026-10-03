const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_ITEM_CHARS = 4000;
const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_INPUT_ITEMS = 50;
const MAX_HISTORY_TOTAL_CHARS = 8000;

export function parseBearer(
  header: string | null
): { kind: "none" } | { kind: "token"; token: string } | { kind: "malformed" } {
  if (header === null || header === "") return { kind: "none" };
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? { kind: "token", token: match[1] } : { kind: "malformed" };
}

type ChatTurn = { role: "user" | "assistant"; content: string };

export function parseChatRequest(
  body: unknown
):
  | { ok: true; value: { message: string; conversationId: string | null; history: ChatTurn[]; stream: boolean } }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.message !== "string" || b.message.trim() === "") {
    return { ok: false, error: "Please type a question" };
  }
  const message = b.message.trim();
  if (message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: `Please keep your question under ${MAX_MESSAGE_CHARS} characters` };
  }
  let conversationId: string | null = null;
  if (b.conversationId !== undefined && b.conversationId !== null) {
    if (typeof b.conversationId !== "string" || !UUID.test(b.conversationId)) {
      return { ok: false, error: "Invalid conversationId" };
    }
    conversationId = b.conversationId;
  }
  let history: ChatTurn[] = [];
  if (b.history !== undefined) {
    if (!Array.isArray(b.history)) return { ok: false, error: "Invalid history" };
    if (b.history.length > MAX_HISTORY_INPUT_ITEMS) return { ok: false, error: "History is too long" };
    let totalChars = 0;
    for (const item of b.history) {
      if (typeof item !== "object" || item === null) {
        return { ok: false, error: "Invalid history" };
      }
      const turn = item as { role?: unknown; content?: unknown };
      if (
        (turn.role !== "user" && turn.role !== "assistant") ||
        typeof turn.content !== "string" ||
        turn.content.length > MAX_HISTORY_ITEM_CHARS
      ) {
        return { ok: false, error: "Invalid history" };
      }
      totalChars += turn.content.length;
      if (totalChars > MAX_HISTORY_TOTAL_CHARS) return { ok: false, error: "History is too long" };
      history.push({ role: turn.role, content: turn.content });
    }
    history = history.slice(-MAX_HISTORY_ITEMS);
  }
  const stream = b.stream === undefined ? true : b.stream === true;
  return { ok: true, value: { message, conversationId, history, stream } };
}
