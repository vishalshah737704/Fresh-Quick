import type { CartSnapshot } from "./action-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_ITEM_CHARS = 8000;
const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_INPUT_ITEMS = 50;
const MAX_HISTORY_TOTAL_CHARS = 40000;

export function parseBearer(
  header: string | null
): { kind: "none" } | { kind: "token"; token: string } | { kind: "malformed" } {
  if (header === null || header === "") return { kind: "none" };
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? { kind: "token", token: match[1] } : { kind: "malformed" };
}

type ChatTurn = { role: "user" | "assistant"; content: string };

// The cart snapshot is a hint for the cart tools, never a reason to fail a chat: the cart itself allows long line ids
// (one uuid per option) and quantities above the card limit. So over-limit values are clamped or the line dropped, and
// only a snapshot that is not shaped like a cart at all becomes null (logged without content).
const MAX_SNAPSHOT_LINE_ID_CHARS = 38 + 37 * 20;
const MAX_SNAPSHOT_LINES = 50;
const MAX_SNAPSHOT_QUANTITY = 20;

function parseCartSnapshot(raw: unknown): CartSnapshot | null {
  if (raw === undefined || raw === null) return null;
  const c = raw as { storeId?: unknown; storeName?: unknown; items?: unknown };
  if (
    typeof raw !== "object" || Array.isArray(raw) ||
    !(c.storeId === null || (typeof c.storeId === "string" && c.storeId.length <= 100)) ||
    !Array.isArray(c.items)
  ) {
    console.error("zippy: ignoring a cart snapshot that is not a cart");
    return null;
  }
  const storeName = typeof c.storeName === "string" ? c.storeName.slice(0, 200) : null;
  const items: CartSnapshot["items"] = [];
  for (const entry of c.items.slice(0, MAX_SNAPSHOT_LINES)) {
    if (typeof entry !== "object" || entry === null) continue;
    const line = entry as { lineId?: unknown; name?: unknown; quantity?: unknown; price?: unknown; options?: unknown };
    if (
      typeof line.lineId !== "string" || line.lineId === "" || line.lineId.length > MAX_SNAPSHOT_LINE_ID_CHARS ||
      typeof line.name !== "string" ||
      typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1 ||
      typeof line.price !== "number" || !Number.isFinite(line.price) || line.price < 0 || line.price > 1_000_000
    ) {
      continue;
    }
    const options = Array.isArray(line.options)
      ? line.options.filter((o): o is string => typeof o === "string").slice(0, 20).map((o) => o.slice(0, 100))
      : [];
    items.push({ lineId: line.lineId, name: line.name.slice(0, 200), quantity: Math.min(line.quantity, MAX_SNAPSHOT_QUANTITY), price: line.price, options });
  }
  return { storeId: c.storeId as string | null, storeName, items };
}

export function parseChatRequest(
  body: unknown
):
  | {
      ok: true;
      value: {
        message: string;
        conversationId: string | null;
        history: ChatTurn[];
        stream: boolean;
        location: { lat: number; lng: number } | null;
        cart: CartSnapshot | null;
      };
    }
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
      history.push({ role: turn.role, content: turn.content });
    }
    history = history.slice(-MAX_HISTORY_ITEMS);
    if (history.reduce((sum, turn) => sum + turn.content.length, 0) > MAX_HISTORY_TOTAL_CHARS) {
      return { ok: false, error: "History is too long" };
    }
  }
  let location: { lat: number; lng: number } | null = null;
  if (b.location !== undefined && b.location !== null) {
    const loc = b.location as { lat?: unknown; lng?: unknown };
    if (
      typeof b.location !== "object" ||
      Array.isArray(b.location) ||
      typeof loc.lat !== "number" || !Number.isFinite(loc.lat) || loc.lat < -90 || loc.lat > 90 ||
      typeof loc.lng !== "number" || !Number.isFinite(loc.lng) || loc.lng < -180 || loc.lng > 180
    ) {
      return { ok: false, error: "Invalid location" };
    }
    location = { lat: loc.lat, lng: loc.lng };
  }
  const cart = parseCartSnapshot(b.cart);
  const stream = b.stream === undefined ? true : b.stream === true;
  return { ok: true, value: { message, conversationId, history, stream, location, cart } };
}
