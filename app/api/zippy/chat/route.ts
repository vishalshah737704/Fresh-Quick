import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { BRAND } from "@/lib/branding";
import { resolveCaller } from "@/lib/zippy/caller";
import { parseChatRequest } from "@/lib/zippy/validate";
import { rateLimitPlan } from "@/lib/zippy/rate-limit";
import { embedQuestion, retrieveCatalogHits, retrieveChunks } from "@/lib/zippy/retrieve";
import { selectContext, buildSystemPrompt, normalizeHistory } from "@/lib/zippy/prompt";
import { runAgent } from "@/lib/zippy/agent";
import { encodeEvent, type StreamEvent } from "@/lib/zippy/stream-events";
import type { ActionCard } from "@/lib/zippy/action-types";
import { hydrateHits, loadCuisineLabels } from "@/lib/zippy/catalog-data";
import { formatCatalogBlock } from "@/lib/zippy/catalog";
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

type ChatTurn = { role: "user" | "assistant"; content: string };

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
  const { message, history: clientHistory, stream, location, cart } = parsed.value;
  let { conversationId } = parsed.value;

  const resolved = await resolveCaller(request);
  if ("error" in resolved) {
    return fail(resolved.status === 401 ? SIGN_IN_AGAIN_MESSAGE : ZIPPY_ERROR_MESSAGE, resolved.status);
  }
  const { caller } = resolved;

  try {
    // Trust model: the LEFTMOST x-forwarded-for entry is client-controlled, so use the
    // rightmost (appended by the nearest proxy/server). This app runs locally with no
    // untrusted proxy; the global visitor bucket caps cost even if IP identity is wrong.
    const forwarded = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
    const ip = forwarded ? forwarded : null;
    if (!(await withinLimits(caller.userId, ip))) return fail(RATE_LIMIT_MESSAGE, 429);

    let history: ChatTurn[];
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

    const toolsEnabled = process.env.ZIPPY_TOOLS !== "off";
    // Orders are visible only to a verified customer; the id comes from the session token, never from the request body.
    const customerId = caller.role === "customer" ? caller.userId : null;
    const ordersEnabled = toolsEnabled && customerId !== null && process.env.ZIPPY_ORDERS !== "off";
    // Cards travel in the JSON reply (stream:false) or in the final `done` event (streaming).
    const actionsEnabled = toolsEnabled && customerId !== null && process.env.ZIPPY_ACTIONS !== "off";
    const actions: ActionCard[] = [];
    const embedding = await embedQuestion(message);
    const chunks = selectContext(await retrieveChunks(embedding, caller.role));
    let catalogBlock = "";
    if (toolsEnabled) {
      try {
        const hits = await retrieveCatalogHits(embedding);
        if (hits.length > 0) {
          const { stores, dishes } = await hydrateHits(hits, location, await loadCuisineLabels());
          catalogBlock = formatCatalogBlock(stores, dishes, new Date().toISOString());
        }
      } catch (error) {
        // The catalog is an optional extra: fall back to knowledge only (the tools can still answer).
        console.error("zippy: catalog retrieval failed", error);
      }
    }
    const system = buildSystemPrompt({ brandName: BRAND.name, role: caller.role, chunks, catalogBlock, toolsEnabled, ordersEnabled, actionsEnabled });
    const messages: ChatTurn[] = [...history, { role: "user", content: message }];
    const sourceIds = chunks.map((c) => c.id);
    const savedConversationId = conversationId;
    // Aborts the model call when the client disconnects (request.signal) or cancels the response body.
    const aborter = new AbortController();
    if (request.signal.aborted) aborter.abort();
    else request.signal.addEventListener("abort", () => aborter.abort(), { once: true });
    const agentArgs = { system, messages, location, toolsEnabled, customerId, ordersEnabled, actionsEnabled, cart, actions, signal: aborter.signal };

    if (!stream) {
      let reply = "";
      for await (const event of runAgent(agentArgs)) if (event.type === "final") reply = event.text;
      if (reply.trim() === "") throw new Error("Model returned an empty reply");
      if (savedConversationId) {
        try {
          await saveMessage({ conversationId: savedConversationId, role: "assistant", content: reply, sourceIds });
        } catch (error) {
          console.error("zippy: saving reply failed", error);
        }
      }
      return NextResponse.json({ reply, conversationId: savedConversationId, actions });
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: StreamEvent) => {
          if (aborter.signal.aborted) return;
          try {
            controller.enqueue(encoder.encode(encodeEvent(event)));
          } catch {
            // client already disconnected
          }
        };
        let reply = "";
        let failed = false;
        try {
          for await (const event of runAgent(agentArgs)) {
            if (aborter.signal.aborted) break;
            if (event.type === "delta") send({ t: "delta", text: event.text });
            else if (event.type === "reset") send({ t: "reset" });
            else reply = event.text;
          }
          if (!aborter.signal.aborted && reply.trim() === "") throw new Error("Model returned an empty reply");
        } catch (error) {
          failed = true;
          if (!aborter.signal.aborted) console.error("zippy: model stream failed", error);
          // Partial deltas may already be on screen; the client replaces them with this message.
          send({ t: "error", message: ZIPPY_ERROR_MESSAGE });
        }
        if (!failed && !aborter.signal.aborted) {
          if (savedConversationId) {
            try {
              await saveMessage({ conversationId: savedConversationId, role: "assistant", content: reply, sourceIds });
            } catch (error) {
              console.error("zippy: saving reply failed", error);
            }
          }
          send({ t: "done", reply, conversationId: savedConversationId, actions });
        }
        try {
          controller.close();
        } catch {
          // already closed or cancelled
        }
      },
      cancel() {
        aborter.abort();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("zippy: chat failed", error);
    return fail(ZIPPY_ERROR_MESSAGE, 502);
  }
}
