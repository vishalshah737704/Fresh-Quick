import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { haversineDistanceKm } from "@/lib/geo";

// Called by n8n's "Delivery Partner Assignment" workflow (spec §5 workflow
// 4) once it has computed a nearest-partner match. n8n is expected to do
// the distance computation itself (per spec: "query online
// delivery_partners, compute Haversine distance ... pick nearest") and
// send the chosen partner id here to write it — this route re-validates
// that choice server-side rather than trusting it blindly, since it's
// still an externally-triggered write.
//
// This is the "push" counterpart to Phase 5's self-claim "pull" model
// (spec's Phase 5 ruling): self-claim stays the tested, working path;
// this route is additive for when real n8n auto-assignment is wired up.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  let deliveryPartnerId: unknown;
  try {
    const body = await request.json();
    deliveryPartnerId = body?.deliveryPartnerId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!deliveryPartnerId || typeof deliveryPartnerId !== "string") {
    return NextResponse.json({ error: "deliveryPartnerId is required" }, { status: 400 });
  }

  const { data: partner, error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .select("user_id, is_online")
    .eq("user_id", deliveryPartnerId)
    .single();
  if (partnerError || !partner || !partner.is_online) {
    return NextResponse.json({ error: "Delivery partner not found or not online" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ delivery_partner_id: deliveryPartnerId, status: "assigned" })
    .eq("id", id)
    .eq("status", "ready")
    .is("delivery_partner_id", null)
    .select("id, status, delivery_partner_id")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Order is not ready or already assigned" }, { status: 409 });
  }

  return NextResponse.json({ order: updated });
}

// Helper n8n's HTTP Request node in workflow 4 can call first, as a GET,
// to fetch nearest-online-partner candidates for the Haversine calculation
// the workflow performs — read-only, so it's a simpler surface than the
// POST above, but still secret-guarded since it exposes partner locations.
export async function GET(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const rawLat = request.nextUrl.searchParams.get("lat");
  const rawLng = request.nextUrl.searchParams.get("lng");
  if (!rawLat || !rawLat.trim().length || !rawLng || !rawLng.trim().length) {
    return NextResponse.json({ error: "lat and lng query params are required" }, { status: 400 });
  }
  const restaurantLat = Number(rawLat);
  const restaurantLng = Number(rawLng);
  if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) {
    return NextResponse.json({ error: "lat and lng query params are required" }, { status: 400 });
  }

  const { data: partners, error } = await supabaseServer
    .from("delivery_partners")
    .select("user_id, current_lat, current_lng")
    .eq("is_online", true)
    .not("current_lat", "is", null)
    .not("current_lng", "is", null);
  if (error) {
    return NextResponse.json({ error: "Failed to load online partners" }, { status: 500 });
  }

  const ranked = (partners ?? [])
    .map((p) => ({
      partnerId: p.user_id,
      distanceKm: haversineDistanceKm(restaurantLat, restaurantLng, p.current_lat!, p.current_lng!),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return NextResponse.json({ candidates: ranked });
}
