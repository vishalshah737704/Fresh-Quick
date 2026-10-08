import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEW_LIMITS, cleanComment } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

async function setReply(request: NextRequest, ctx: Ctx, mode: "set" | "clear") {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });

  let reply: string | null = null;
  if (mode === "set") {
    let body: { reply?: unknown } = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const cleaned = cleanComment(body.reply, REVIEW_LIMITS.reply);
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    if (cleaned.value === null) return NextResponse.json({ error: "Write a reply first" }, { status: 400 });
    reply = cleaned.value;
  }

  // Filtering on the resolved store id makes another store's review simply "not found".
  const { data, error } = await supabaseServer
    .from("reviews")
    .update({ vendor_reply: reply, vendor_reply_at: reply === null ? null : new Date().toISOString() })
    .eq("id", id.toLowerCase())
    .eq("store_id", resolved.storeId)
    .eq("status", "visible")
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the reply right now" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const PUT = (request: NextRequest, ctx: Ctx) => setReply(request, ctx, "set");
export const DELETE = (request: NextRequest, ctx: Ctx) => setReply(request, ctx, "clear");
