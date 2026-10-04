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

function parseCartSnapshot(raw: unknown): CartSnapshot | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalid";
  const c = raw as { storeId?: unknown; storeName?: unknown; items?: unknown };
  const text = (v: unknown, max: number) => v === null || (typeof v === "string" && v.length <= max);
  if (!text(c.storeId, 100) || !text(c.storeName, 200) || c.storeId === undefined || c.storeName === undefined) return "invalid";
  if (!Array.isArray(c.items) || c.items.length > 50) return "invalid";
  const items: CartSnapshot["items"] = [];
  for (const entry of c.items) {
    if (typeof entry !== "object" || entry === null) return "invalid";
    const line = entry as { lineId?: unknown; name?: unknown; quantity?: unknown; price?: unknown; options?: unknown };
    if (
      typeof line.lineId !== "string" || line.lineId === "" || line.lineId.length > 200 ||
      typeof line.name !== "string" || line.name.length > 200 ||
      typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20 ||
      typeof line.price !== "number" || !Number.isFinite(line.price) || line.price < 0 || line.price > 1_000_000 ||
      !Array.isArray(line.options) || line.options.length > 20 || !line.options.every((o) => typeof o === "string" && o.length <= 100)
    ) {
      return "invalid";
    }
    items.push({ lineId: line.lineId, name: line.name, quantity: line.quantity, price: line.price, options: line.options as string[] });
  }
  return { storeId: c.storeId as string | null, storeName: c.storeName as string | null, items };
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
  if (cart === "invalid") return { ok: false, error: "Invalid cart" };
  const stream = b.stream === undefined ? true : b.stream === true;
  return { ok: true, value: { message, conversationId, history, stream, location, cart } };
}
