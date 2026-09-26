import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";
import { assertOwnsOption } from "@/lib/vendor-option-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ optionId: string }> }
) {
  const { optionId } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsOption(resolved.restaurantId, optionId))) {
    return NextResponse.json({ error: "Option not found" }, { status: 404 });
  }
  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    update.name = body.name.trim();
  }
  if (body.priceDeltaRupees !== undefined) {
    const delta = Number(body.priceDeltaRupees);
    if (!Number.isFinite(delta) || delta < 0) {
      return NextResponse.json(
        { error: "priceDeltaRupees must be a non-negative number" },
        { status: 400 }
      );
    }
    update.price_delta_paise = Math.round(delta * 100);
  }
  const { data, error } = await supabaseServer
    .from("menu_item_options")
    .update(update)
    .eq("id", optionId)
    .select("id, name, price_delta_paise, sort_order")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to update option" }, { status: 500 });
  }
  return NextResponse.json({ option: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ optionId: string }> }
) {
  const { optionId } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsOption(resolved.restaurantId, optionId))) {
    return NextResponse.json({ error: "Option not found" }, { status: 404 });
  }
  const { error } = await supabaseServer.from("menu_item_options").delete().eq("id", optionId);
  if (error) {
    return NextResponse.json({ error: "Failed to delete option" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
