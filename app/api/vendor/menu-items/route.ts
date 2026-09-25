import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";
import { isAllowedImageUrl } from "@/lib/image-url";

export async function GET(request: NextRequest) {
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", resolved.restaurantId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load menu items" }, { status: 500 });
  }
  return NextResponse.json({ items: data });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { name, description, price, category, isVeg, imageUrl } = await request.json();
  if (!name || typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "name and a positive price are required" }, { status: 400 });
  }
  if (typeof imageUrl === "string" && imageUrl.length > 0 && !isAllowedImageUrl(imageUrl)) {
    return NextResponse.json(
      { error: "Image URL must be from an approved host" },
      { status: 400 }
    );
  }
  const pricePaise = Math.round(price * 100);
  const { data, error } = await supabaseServer
    .from("menu_items")
    .insert({
      restaurant_id: resolved.restaurantId,
      name,
      description: description ?? null,
      price: pricePaise / 100,
      category: category ?? null,
      is_veg: Boolean(isVeg),
      image_url: imageUrl || null,
    })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to create menu item" }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}
