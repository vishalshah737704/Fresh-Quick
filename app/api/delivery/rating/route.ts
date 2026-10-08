import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";
import { averageOf, toPartnerReviewRow, type PartnerRating, type PartnerReviewRow } from "@/lib/reviews-model";

export async function GET(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const [{ data: partner, error: partnerError }, { data: rows, error: rowsError }] = await Promise.all([
    supabaseServer.from("delivery_partners").select("rating_sum, rating_count").eq("user_id", resolved.partnerId).maybeSingle(),
    supabaseServer
      .from("reviews")
      .select("created_at, review_partner!inner(stars, comment, partner_id)")
      .eq("status", "visible")
      .eq("review_partner.partner_id", resolved.partnerId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (partnerError || rowsError) return NextResponse.json({ error: "Failed to load rating" }, { status: 500 });

  const recent = ((rows ?? []) as unknown as Parameters<typeof toPartnerReviewRow>[0][])
    .map(toPartnerReviewRow)
    .filter((row): row is PartnerReviewRow => row !== null);
  const body: PartnerRating = {
    average: averageOf(partner?.rating_sum ?? 0, partner?.rating_count ?? 0),
    count: partner?.rating_count ?? 0,
    recent,
  };
  return NextResponse.json(body);
}
