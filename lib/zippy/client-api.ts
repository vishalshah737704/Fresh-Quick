import { supabase } from "@/lib/supabase";
import { ZIPPY_ERROR_MESSAGE } from "./constants";
import type { ActionCard, CartSnapshot } from "./action-types";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ConversationSummary = { id: string; title: string; created_at: string };

export class ZippyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function errorFrom(res: Response): Promise<ZippyError> {
  let message = ZIPPY_ERROR_MESSAGE;
  try {
    const json = await res.json();
    if (typeof json?.error === "string") message = json.error;
  } catch {
    // keep the friendly default
  }
  return new ZippyError(message, res.status);
}

export async function streamChat(args: {
  message: string;
  conversationId: string | null;
  history: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  location?: { lat: number; lng: number } | null;
}): Promise<{ conversationId: string | null }> {
  const res = await fetch("/api/zippy/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      message: args.message,
      conversationId: args.conversationId,
      history: args.history,
      stream: true,
      location: args.location ?? undefined,
    }),
    signal: args.signal,
  });
  if (!res.ok || !res.body) throw await errorFrom(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    args.onDelta(decoder.decode(value, { stream: true }));
  }
  return { conversationId: res.headers.get("X-Zippy-Conversation-Id") };
}

export async function sendChat(args: {
  message: string;
  conversationId: string | null;
  history: ChatMessage[];
  signal?: AbortSignal;
  location?: { lat: number; lng: number } | null;
  cart?: CartSnapshot | null;
}): Promise<{ reply: string; conversationId: string | null; actions: ActionCard[] }> {
  const res = await fetch("/api/zippy/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      message: args.message,
      conversationId: args.conversationId,
      history: args.history,
      stream: false,
      location: args.location ?? undefined,
      cart: args.cart ?? undefined,
    }),
    signal: args.signal,
  });
  if (!res.ok) throw await errorFrom(res);
  const json = (await res.json()) as { reply?: unknown; conversationId?: unknown; actions?: unknown };
  return {
    reply: typeof json.reply === "string" ? json.reply : "",
    conversationId: typeof json.conversationId === "string" ? json.conversationId : null,
    actions: Array.isArray(json.actions) ? (json.actions as ActionCard[]) : [],
  };
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch("/api/zippy/conversations", { headers: await authHeaders() });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()).conversations as ConversationSummary[];
}

export async function loadConversation(id: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/zippy/conversations/${id}`, { headers: await authHeaders() });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()).messages as { role: "user" | "assistant"; content: string }[]).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
