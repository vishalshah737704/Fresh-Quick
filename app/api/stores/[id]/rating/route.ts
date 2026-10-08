import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uuidsOnly } from "@/lib/zippy/actions";
import { averageOf, buildHistogram } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });
  const storeId = id.toLowerCase();
  const [{ data: store, error: storeError }, { data: stars, error: starsError }] = await Promise.all([
    supabaseServer.from("stores").select("rating_sum, rating_count").eq("id", storeId).maybeSingle(),
    supabaseServer.from("reviews").select("rating").eq("store_id", storeId).eq("status", "visible").range(0, 4999),
  ]);
  if (storeError || starsError) return NextResponse.json({ error: "Failed to load rating" }, { status: 500 });
  if (!store) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    rating: averageOf(store.rating_sum, store.rating_count),
    count: store.rating_count,
    histogram: buildHistogram((stars ?? []).map((row) => row.rating as number)),
  });
}
