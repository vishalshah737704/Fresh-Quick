import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { BRAND } from "@/lib/branding";
import { resolveCaller } from "@/lib/zippy/caller";
import { parseChatRequest } from "@/lib/zippy/validate";
import { limitMessage, preAuthPlan, rateLimitPlan, retryAfterSeconds, type Limit } from "@/lib/zippy/rate-limit";
import { clientIpFromForwarded, parseTrustedHops } from "@/lib/zippy/client-ip";
import { MAX_BODY_BYTES, declaredLengthTooLarge, readTextWithCap } from "@/lib/zippy/body-cap";
import { embedQuestion, retrieveCatalogHits, retrieveChunks } from "@/lib/zippy/retrieve";
import { selectContext, buildSystemPrompt, normalizeHistory } from "@/lib/zippy/prompt";
import { runAgent } from "@/lib/zippy/agent";
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
  BODY_TOO_LARGE_MESSAGE,
  MAX_HISTORY_MESSAGES,
  SIGN_IN_AGAIN_MESSAGE,
  ZIPPY_ERROR_MESSAGE,
} from "@/lib/zippy/constants";

type ChatTurn = { role: "user" | "assistant"; content: string };

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Counts one hit per bucket and stops at the first one over its limit (returned); null = allowed.
// A failing zippy_hit throws, so the caller fails closed.
async function firstTrippedLimit(plan: Limit[]): Promise<Limit | null> {
  for (const step of plan) {
    const { data, error } = await supabaseServer.rpc("zippy_hit", {
      p_bucket: step.bucket,
      p_window_seconds: step.windowSeconds,
      p_limit: step.limit,
    });
    if (error) throw new Error(`zippy_hit failed: ${error.message}`);
    if (data === false) return step;
  }
  return null;
}

function tooManyRequests(step: Limit) {
  const retryAfter = retryAfterSeconds(step.windowSeconds, Date.now());
  // Class only: no user id, raw IP or message content.
  console.warn("zippy: rate limit tripped", step.kind);
  return NextResponse.json(
    { error: limitMessage(step.kind, retryAfter) },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: NextRequest) {
  // Trust model: ZIPPY_TRUSTED_PROXY_HOPS (default 1) trusted proxies sit in front of this app, so the
  // client is the x-forwarded-for entry that many positions from the right; entries further left are
  // client-controlled. With 0 hops the header is ignored and every caller shares the "unknown" IP bucket.
  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for"),
    parseTrustedHops(process.env.ZIPPY_TRUSTED_PROXY_HOPS),
  );

  // Cheap burst check BEFORE the body is read or the caller is authenticated, for every caller.
  try {
    const tripped = await firstTrippedLimit(preAuthPlan(ip));
    if (tripped) return tooManyRequests(tripped);
  } catch (error) {
    console.error("zippy: chat failed", error);
    return fail(ZIPPY_ERROR_MESSAGE, 502);
  }

  if (declaredLengthTooLarge(request.headers.get("content-length"))) return fail(BODY_TOO_LARGE_MESSAGE, 413);
  let raw: unknown;
  try {
    const body = await readTextWithCap(request.body, MAX_BODY_BYTES);
    if (!body.ok) return fail(BODY_TOO_LARGE_MESSAGE, 413);
    raw = JSON.parse(body.text);
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
    const tripped = await firstTrippedLimit(rateLimitPlan({ userId: caller.userId, ip }));
    if (tripped) return tooManyRequests(tripped);

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
    // Cards travel only in the non-streaming JSON reply, so a streaming request gets no action tools (it could not show their cards).
    const actionsEnabled = toolsEnabled && customerId !== null && process.env.ZIPPY_ACTIONS !== "off" && !stream;
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
    const agentArgs = { system, messages, location, toolsEnabled, customerId, ordersEnabled, actionsEnabled, cart, actions, signal: request.signal };

    if (!stream) {
      let reply = "";
      for await (const piece of runAgent(agentArgs)) reply += piece;
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
        let full = "";
        let failed = false;
        try {
          for await (const piece of runAgent(agentArgs)) {
            full += piece;
            controller.enqueue(encoder.encode(piece));
          }
          if (full.trim() === "") {
            failed = true;
            console.error("zippy: model returned an empty reply");
            controller.enqueue(encoder.encode(ZIPPY_ERROR_MESSAGE));
          }
        } catch (error) {
          failed = true;
          if (!request.signal.aborted) console.error("zippy: model stream failed", error);
          try {
            controller.enqueue(encoder.encode(full ? `

${ZIPPY_ERROR_MESSAGE}` : ZIPPY_ERROR_MESSAGE));
          } catch {
            // client already disconnected
          }
        }
        if (!failed && savedConversationId && full) {
          try {
            await saveMessage({ conversationId: savedConversationId, role: "assistant", content: full, sourceIds });
          } catch (error) {
            console.error("zippy: saving reply failed", error);
          }
        }
        try {
          controller.close();
        } catch {
          // already closed or cancelled
        }
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
