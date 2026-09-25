import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";

export async function PATCH(request: NextRequest) {
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const body = await request.json();
  if (typeof body.isOpen !== "boolean") {
    return NextResponse.json({ error: "isOpen must be a boolean" }, { status: 400 });
  }

  if (body.isOpen) {
    const { count, error: countError } = await supabaseServer
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", resolved.restaurantId)
      .eq("is_available", true);
    if (countError) {
      return NextResponse.json({ error: "Failed to check menu items" }, { status: 500 });
    }
    if (!count || count === 0) {
      return NextResponse.json(
        { error: "Add at least one available menu item before opening" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseServer
    .from("restaurants")
    .update({ is_open: body.isOpen })
    .eq("id", resolved.restaurantId)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to update restaurant" }, { status: 500 });
  }
  return NextResponse.json({ restaurant: data });
}
