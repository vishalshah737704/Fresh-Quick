import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import { REVIEWS_PAGE_SIZE, REVIEW_SELECT, reviewPhotoPath, toVendorReview, type RawReviewRow } from "@/lib/reviews-model";

export async function GET(request: NextRequest) {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const status = request.nextUrl.searchParams.get("status") ?? "all";
  if (!["all", "no_reply", "reported"].includes(status)) return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  const before = request.nextUrl.searchParams.get("before");
  if (before !== null && Number.isNaN(Date.parse(before))) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  let query = supabaseServer
    .from("reviews")
    .select(REVIEW_SELECT)
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false })
    .limit(REVIEWS_PAGE_SIZE + 1);
  if (status === "no_reply") query = query.eq("status", "visible").is("vendor_reply", null);
  if (status === "reported") query = query.eq("status", "visible").not("reported_at", "is", null);
  if (before) query = query.lt("created_at", before);

  const [{ data, error }, { count }] = await Promise.all([
    query,
    supabaseServer
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("store_id", resolved.storeId)
      .eq("status", "visible")
      .is("vendor_reply", null),
  ]);
  if (error) return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  const rows = (data ?? []) as unknown as RawReviewRow[];
  const page = rows.slice(0, REVIEWS_PAGE_SIZE);
  return NextResponse.json({
    reviews: page.map((row) => toVendorReview(row, row.photo_path ? reviewPhotoPath(row.id) : null)),
    nextCursor: rows.length > REVIEWS_PAGE_SIZE ? page[page.length - 1].created_at : null,
    needsReply: count ?? 0,
  });
}
