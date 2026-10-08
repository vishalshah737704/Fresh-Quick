import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { buildModerationPatch, type ModerationAction } from "@/lib/review-moderation";

export async function moderate(request: NextRequest, ctx: { params: Promise<{ id: string }> }, action: ModerationAction) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });

  let reason: unknown;
  if (action === "hide") {
    try {
      reason = ((await request.json()) as { reason?: unknown } | null)?.reason;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  }
  const built = buildModerationPatch(action, reason, new Date().toISOString());
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

  // The status trigger in migration 37 recomputes the store, dish and partner averages.
  const { data, error } = await supabaseServer.from("reviews").update(built.patch).eq("id", id.toLowerCase()).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update the review right now" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
