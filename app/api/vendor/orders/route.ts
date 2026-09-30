import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  type RawOrderDetail,
} from "@/lib/order-detail";

export async function GET(request: NextRequest) {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("store_id", resolved.storeId)
    .in("status", ["placed", "accepted", "preparing", "ready"])
    .order("placed_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
  const orders = (data as unknown as RawOrderDetail[]).map(normalizeOrderDetail);
  return NextResponse.json({ orders });
}
