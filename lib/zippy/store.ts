import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type Turn = { role: "user" | "assistant"; content: string };

export async function createConversation(userId: string, title: string): Promise<string> {
  const { data, error } = await supabaseServer
    .from("zippy_conversations")
    .insert({ user_id: userId, title: title.slice(0, 80) })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createConversation failed: ${error?.message}`);
  return data.id as string;
}

export async function ownsConversation(conversationId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from("zippy_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}

export async function loadRecentMessages(conversationId: string, limit: number): Promise<Turn[]> {
  const { data, error } = await supabaseServer
    .from("zippy_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`loadRecentMessages failed: ${error.message}`);
  return ((data ?? []) as Turn[]).reverse();
}

export async function saveMessage(args: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sourceIds?: string[];
}): Promise<void> {
  const { error } = await supabaseServer.from("zippy_messages").insert({
    conversation_id: args.conversationId,
    role: args.role,
    content: args.content,
    source_ids: args.sourceIds ?? [],
  });
  if (error) throw new Error(`saveMessage failed: ${error.message}`);
}

export async function listConversations(userId: string) {
  const { data, error } = await supabaseServer
    .from("zippy_conversations")
    .select("id, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`listConversations failed: ${error.message}`);
  return data ?? [];
}

export async function getConversationMessages(conversationId: string, userId: string) {
  if (!(await ownsConversation(conversationId, userId))) return null;
  const { data, error } = await supabaseServer
    .from("zippy_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getConversationMessages failed: ${error.message}`);
  return data ?? [];
}
