import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("orders")
    .select(
      "id, status, subtotal, delivery_fee, total, placed_at, order_items(id, quantity, unit_price, special_instructions, menu_items(name), order_item_options(id, group_name, option_name))"
    )
    .eq("restaurant_id", resolved.restaurantId)
    .order("placed_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
  return NextResponse.json({ orders: data });
}
