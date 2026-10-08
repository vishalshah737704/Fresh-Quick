import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEW_BUCKET } from "@/lib/reviews-server";

type Ctx = { params: Promise<{ id: string }> };

const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Only a VISIBLE review serves its photo; hiding a review stops the photo at request time.
export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return new NextResponse(null, { status: 404 });
  const { data: review } = await supabaseServer
    .from("reviews")
    .select("photo_path, status")
    .eq("id", id.toLowerCase())
    .maybeSingle();
  if (!review || review.status !== "visible" || !review.photo_path) return new NextResponse(null, { status: 404 });
  const { data: blob, error } = await supabaseServer.storage.from(REVIEW_BUCKET).download(review.photo_path);
  if (error || !blob) return new NextResponse(null, { status: 404 });
  const ext = review.photo_path.split(".").pop() ?? "";
  return new NextResponse(await blob.arrayBuffer(), {
    headers: {
      "Content-Type": TYPE_BY_EXT[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
