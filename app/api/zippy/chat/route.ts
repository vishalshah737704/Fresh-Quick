import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { BRAND } from "@/lib/branding";
import { resolveCaller } from "@/lib/zippy/caller";
import { parseChatRequest } from "@/lib/zippy/validate";
import { rateLimitPlan } from "@/lib/zippy/rate-limit";
import { retrieveChunks } from "@/lib/zippy/retrieve";
import { selectContext, buildSystemPrompt, normalizeHistory } from "@/lib/zippy/prompt";
import { streamClaude, type ClaudeMessage } from "@/lib/zippy/claude";
import {
  createConversation,
  ownsConversation,
  loadRecentMessages,
  saveMessage,
} from "@/lib/zippy/store";
import {
  MAX_HISTORY_MESSAGES,
  RATE_LIMIT_MESSAGE,
  SIGN_IN_AGAIN_MESSAGE,
  ZIPPY_ERROR_MESSAGE,
} from "@/lib/zippy/constants";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

async function withinLimits(userId: string | null, ip: string | null): Promise<boolean> {
  for (const step of rateLimitPlan({ userId, ip })) {
    const { data, error } = await supabaseServer.rpc("zippy_hit", {
      p_bucket: step.bucket,
      p_window_seconds: step.windowSeconds,
      p_limit: step.limit,
    });
    if (error) throw new Error(`zippy_hit failed: ${error.message}`);
    if (data === false) return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("Invalid request body", 400);
  }
  const parsed = parseChatRequest(raw);
  if (!parsed.ok) return fail(parsed.error, 400);
  const { message, history: clientHistory, stream } = parsed.value;
  let { conversationId } = parsed.value;

  const resolved = await resolveCaller(request);
  if ("error" in resolved) return fail(SIGN_IN_AGAIN_MESSAGE, resolved.status);
  const { caller } = resolved;

  try {
    // Trust model: the LEFTMOST x-forwarded-for entry is client-controlled, so use the
    // rightmost (appended by the nearest proxy/server). This app runs locally with no
    // untrusted proxy; the global visitor bucket caps cost even if IP identity is wrong.
    const forwarded = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
    const ip = forwarded ? forwarded : null;
    if (!(await withinLimits(caller.userId, ip))) return fail(RATE_LIMIT_MESSAGE, 429);

    let history: ClaudeMessage[];
    if (caller.userId) {
      if (conversationId) {
        if (!(await ownsConversation(conversationId, caller.userId))) {
          return fail("Conversation not found", 404);
        }
        history = normalizeHistory(await loadRecentMessages(conversationId, MAX_HISTORY_MESSAGES), MAX_HISTORY_MESSAGES);
      } else {
        conversationId = await createConversation(caller.userId, message);
        history = [];
      }
      await saveMessage({ conversationId, role: "user", content: message });
    } else {
      conversationId = null;
      history = normalizeHistory(clientHistory, MAX_HISTORY_MESSAGES);
    }

    const matches = await retrieveChunks(message, caller.role);
    const chunks = selectContext(matches);
    const system = buildSystemPrompt({ brandName: BRAND.name, role: caller.role, chunks });
    const messages: ClaudeMessage[] = [...history, { role: "user", content: message }];
    const sourceIds = chunks.map((c) => c.id);
    const savedConversationId = conversationId;

    if (!stream) {
      let reply = "";
      for await (const piece of streamClaude(system, messages)) reply += piece;
      if (savedConversationId) {
        await saveMessage({ conversationId: savedConversationId, role: "assistant", content: reply, sourceIds });
      }
      return NextResponse.json({ reply, conversationId: savedConversationId });
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let full = "";
        let failed = false;
        try {
          for await (const piece of streamClaude(system, messages)) {
            full += piece;
            controller.enqueue(encoder.encode(piece));
          }
        } catch (error) {
          failed = true;
          console.error("zippy: model stream failed", error);
          controller.enqueue(encoder.encode(full ? `\n\n${ZIPPY_ERROR_MESSAGE}` : ZIPPY_ERROR_MESSAGE));
        }
        if (!failed && savedConversationId && full) {
          try {
            await saveMessage({ conversationId: savedConversationId, role: "assistant", content: full, sourceIds });
          } catch (error) {
            console.error("zippy: saving reply failed", error);
          }
        }
        controller.close();
      },
    });
    const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
    if (savedConversationId) headers["X-Zippy-Conversation-Id"] = savedConversationId;
    return new Response(body, { headers });
  } catch (error) {
    console.error("zippy: chat failed", error);
    return fail(ZIPPY_ERROR_MESSAGE, 502);
  }
}
