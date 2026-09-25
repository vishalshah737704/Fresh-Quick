import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";

async function assertOwnsItem(restaurantId: string, itemId: string) {
  const { data, error } = await supabaseServer
    .from("menu_items")
    .select("id")
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId)
    .single();
  return !error && !!data;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsItem(resolved.restaurantId, id))) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name;
  if (typeof body.description === "string") update.description = body.description;
  if (typeof body.category === "string") update.category = body.category;
  if (typeof body.isVeg === "boolean") update.is_veg = body.isVeg;
  if (typeof body.isAvailable === "boolean") update.is_available = body.isAvailable;
  if (typeof body.imageUrl === "string") update.image_url = body.imageUrl;
  if (typeof body.price === "number") {
    if (!Number.isFinite(body.price) || body.price <= 0) {
      return NextResponse.json({ error: "price must be positive" }, { status: 400 });
    }
    update.price = Math.round(body.price * 100) / 100;
  }

  const { data, error } = await supabaseServer
    .from("menu_items")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to update menu item" }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsItem(resolved.restaurantId, id))) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  const { error } = await supabaseServer.from("menu_items").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Failed to delete menu item" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
