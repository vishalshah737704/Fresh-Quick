import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  type RawOrderDetail,
} from "@/lib/order-detail";
import { redactForDelivery } from "@/lib/delivery-order-view";

export async function GET(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data: partner, error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .select("is_online")
    .eq("user_id", resolved.partnerId)
    .single();
  if (partnerError || !partner) {
    return NextResponse.json({ error: "Failed to load partner" }, { status: 500 });
  }

  const { data: mineRows, error: mineError } = await supabaseServer
    .from("orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("delivery_partner_id", resolved.partnerId)
    .in("status", ["assigned", "picked_up"])
    .order("placed_at", { ascending: true });
  if (mineError) {
    return NextResponse.json({ error: "Failed to load your orders" }, { status: 500 });
  }

  let availableRows: unknown[] = [];
  if (partner.is_online) {
    const { data, error } = await supabaseServer
      .from("orders")
      .select(ORDER_DETAIL_SELECT)
      .eq("status", "ready")
      .is("delivery_partner_id", null)
      .order("placed_at", { ascending: true });
    if (error) {
      return NextResponse.json({ error: "Failed to load available orders" }, { status: 500 });
    }
    availableRows = data ?? [];
  }

  const toDetail = (row: unknown) => normalizeOrderDetail(row as RawOrderDetail);
  return NextResponse.json({
    available: availableRows.map((row) => redactForDelivery(toDetail(row), "available")),
    mine: (mineRows ?? []).map((row) => redactForDelivery(toDetail(row), "active")),
  });
}
