import { fetch as expoFetch } from "expo/fetch";
import { supabase } from "./supabase";
import { createLineParser, type StreamEvent } from "./stream-events";
import { ZIPPY_ERROR_MESSAGE } from "./zippy-constants";
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

const REQUEST_TIMEOUT_MS = 60_000;

// Unlike apiFetch, a missing session is fine: visitors can ask help questions.
// The base URL is read at call time so a missing env var never breaks import.
async function request<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!apiBaseUrl) throw new ZippyError(ZIPPY_ERROR_MESSAGE, 0);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(`${apiBaseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new ZippyError(ZIPPY_ERROR_MESSAGE, 0);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON body; fall through to status handling (a timeout mid-body is handled below)
  } finally {
    clearTimeout(timer);
  }
  if (controller.signal.aborted) throw new ZippyError(ZIPPY_ERROR_MESSAGE, 0);
  if (!res.ok) {
    const message =
      json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : ZIPPY_ERROR_MESSAGE;
    throw new ZippyError(message, res.status);
  }
  return json as T;
}

export async function sendChat(args: {
  message: string;
  conversationId: string | null;
  history: ChatMessage[];
  location?: { lat: number; lng: number } | null;
  cart?: CartSnapshot | null;
}): Promise<{ reply: string; conversationId: string | null; actions: ActionCard[] }> {
  const result = await request<{ reply: string; conversationId: string | null; actions?: ActionCard[] }>("/api/zippy/chat", {
    method: "POST",
    body: { ...args, stream: false },
  });
  return { reply: result.reply, conversationId: result.conversationId, actions: Array.isArray(result.actions) ? result.actions : [] };
}

// React Native's global fetch has no streaming body; expo/fetch does. Falls back to the
// non-streaming sendChat only when expo/fetch is unavailable, never after text was shown.
export async function streamChat(args: {
  message: string;
  conversationId: string | null;
  history: ChatMessage[];
  onDelta: (text: string) => void;
  onReset: () => void;
  signal?: AbortSignal;
  location?: { lat: number; lng: number } | null;
  cart?: CartSnapshot | null;
}): Promise<{ reply: string; conversationId: string | null; actions: ActionCard[] }> {
  if (typeof expoFetch !== "function") {
    return sendChat({ message: args.message, conversationId: args.conversationId, history: args.history, location: args.location, cart: args.cart });
  }
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!apiBaseUrl) throw new ZippyError(ZIPPY_ERROR_MESSAGE, 0);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onUserAbort = () => controller.abort();
  if (args.signal) {
    if (args.signal.aborted) controller.abort();
    else args.signal.addEventListener("abort", onUserAbort);
  }
  try {
    let res: Awaited<ReturnType<typeof expoFetch>>;
    try {
      res = await expoFetch(`${apiBaseUrl}/api/zippy/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          message: args.message,
          conversationId: args.conversationId,
          history: args.history,
          stream: true,
          location: args.location ?? undefined,
          cart: args.cart ?? undefined,
        }),
        signal: controller.signal,
      });
    } catch {
      throw new ZippyError(ZIPPY_ERROR_MESSAGE, 0);
    }
    if (!res.ok) {
      let message = ZIPPY_ERROR_MESSAGE;
      try {
        const json = await res.json();
        if (typeof json?.error === "string") message = json.error;
      } catch {
        // keep the friendly default
      }
      throw new ZippyError(message, res.status);
    }
    if (!res.body) throw new ZippyError(ZIPPY_ERROR_MESSAGE, res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parse = createLineParser();
    const handle = (events: StreamEvent[]) => {
      for (const event of events) {
        if (event.t === "delta") args.onDelta(event.text);
        else if (event.t === "reset") args.onReset();
        else if (event.t === "error") throw new ZippyError(event.message, res.status);
        else return { reply: event.reply, conversationId: event.conversationId, actions: event.actions as ActionCard[] };
      }
      return null;
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const finished = handle(parse(decoder.decode(value, { stream: true })));
        if (finished) return finished;
      }
    } catch (error) {
      if (error instanceof ZippyError) throw error;
      throw new ZippyError(ZIPPY_ERROR_MESSAGE, 0);
    }
    // Flush a final line that arrived without a trailing newline.
    const finished = handle(parse(decoder.decode() + "\n"));
    if (finished) return finished;
    throw new ZippyError(ZIPPY_ERROR_MESSAGE, res.status);
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener("abort", onUserAbort);
  }
}

export async function listConversations(): Promise<ConversationSummary[]> {
  return (await request<{ conversations: ConversationSummary[] }>("/api/zippy/conversations")).conversations;
}

export async function loadConversation(id: string): Promise<ChatMessage[]> {
  const { messages } = await request<{ messages: ChatMessage[] }>(`/api/zippy/conversations/${id}`);
  return messages.map((m) => ({ role: m.role, content: m.content }));
}
