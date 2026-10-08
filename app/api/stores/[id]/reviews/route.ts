import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEWS_PAGE_SIZE, REVIEW_SELECT, reviewPhotoPath, toPublicReview, type RawReviewRow } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });
  const before = request.nextUrl.searchParams.get("before");
  if (before !== null && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  let query = supabaseServer
    .from("reviews")
    .select(REVIEW_SELECT)
    .eq("store_id", id.toLowerCase())
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(REVIEWS_PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  const rows = (data ?? []) as unknown as RawReviewRow[];
  const page = rows.slice(0, REVIEWS_PAGE_SIZE);
  return NextResponse.json({
    reviews: page.map((row) => toPublicReview(row, row.photo_path ? reviewPhotoPath(row.id) : null)),
    nextCursor: rows.length > REVIEWS_PAGE_SIZE ? page[page.length - 1].created_at : null,
  });
}
