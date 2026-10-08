import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { signReviewPhoto } from "@/lib/reviews-server";
import { REVIEWS_PAGE_SIZE, REVIEW_SELECT, toAdminReview, type RawReviewRow } from "@/lib/reviews-model";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const filter = request.nextUrl.searchParams.get("filter") ?? "reported";
  if (!["reported", "hidden", "all"].includes(filter)) return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  const before = request.nextUrl.searchParams.get("before");
  if (before !== null && Number.isNaN(Date.parse(before))) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  let query = supabaseServer
    .from("reviews")
    .select(REVIEW_SELECT)
    .order("created_at", { ascending: false })
    .limit(REVIEWS_PAGE_SIZE + 1);
  if (filter === "reported") query = query.eq("status", "visible").not("reported_at", "is", null);
  if (filter === "hidden") query = query.eq("status", "hidden");
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  const rows = (data ?? []) as unknown as RawReviewRow[];
  const page = rows.slice(0, REVIEWS_PAGE_SIZE);
  const reviews = await Promise.all(page.map(async (row) => toAdminReview(row, await signReviewPhoto(row.photo_path))));
  return NextResponse.json({
    reviews,
    nextCursor: rows.length > REVIEWS_PAGE_SIZE ? page[page.length - 1].created_at : null,
  });
}
