import { supabase } from "./supabase";
import { ZIPPY_ERROR_MESSAGE } from "./zippy-constants";

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
}): Promise<{ reply: string; conversationId: string | null }> {
  return request("/api/zippy/chat", {
    method: "POST",
    body: { ...args, stream: false },
  });
}

export async function listConversations(): Promise<ConversationSummary[]> {
  return (await request<{ conversations: ConversationSummary[] }>("/api/zippy/conversations")).conversations;
}

export async function loadConversation(id: string): Promise<ChatMessage[]> {
  const { messages } = await request<{ messages: ChatMessage[] }>(`/api/zippy/conversations/${id}`);
  return messages.map((m) => ({ role: m.role, content: m.content }));
}
