import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";
import { assertOwnsGroup } from "@/lib/vendor-option-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsGroup(resolved.restaurantId, groupId))) {
    return NextResponse.json({ error: "Option group not found" }, { status: 404 });
  }
  const { name, priceDeltaRupees } = await request.json();
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const delta = priceDeltaRupees === undefined ? 0 : Number(priceDeltaRupees);
  if (!Number.isFinite(delta) || delta < 0) {
    return NextResponse.json(
      { error: "priceDeltaRupees must be a non-negative number" },
      { status: 400 }
    );
  }
  const { count } = await supabaseServer
    .from("menu_item_options")
    .select("id", { count: "exact", head: true })
    .eq("option_group_id", groupId);
  const { data, error } = await supabaseServer
    .from("menu_item_options")
    .insert({
      option_group_id: groupId,
      name: name.trim(),
      price_delta_paise: Math.round(delta * 100),
      sort_order: count ?? 0,
    })
    .select("id, name, price_delta_paise, sort_order")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to create option" }, { status: 500 });
  }
  return NextResponse.json({ option: data });
}
