import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";

async function assertOwnsItem(storeId: string, itemId: string) {
  const { data, error } = await supabaseServer
    .from("products")
    .select("id")
    .eq("id", itemId)
    .eq("store_id", storeId)
    .single();
  return !error && !!data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsItem(resolved.storeId, id))) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  const { data, error } = await supabaseServer
    .from("menu_item_option_groups")
    .select(
      "id, name, min_select, max_select, sort_order, menu_item_options(id, name, price_delta_paise, sort_order)"
    )
    .eq("product_id", id)
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Failed to load option groups" }, { status: 500 });
  }
  return NextResponse.json({ groups: data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsItem(resolved.storeId, id))) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  const { name, minSelect, maxSelect } = await request.json();
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!Number.isInteger(minSelect) || minSelect < 0) {
    return NextResponse.json(
      { error: "minSelect must be a non-negative integer" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(maxSelect) || maxSelect < 1 || maxSelect < minSelect) {
    return NextResponse.json(
      { error: "maxSelect must be a positive integer >= minSelect" },
      { status: 400 }
    );
  }
  const { count } = await supabaseServer
    .from("menu_item_option_groups")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);
  const { data, error } = await supabaseServer
    .from("menu_item_option_groups")
    .insert({
      product_id: id,
      name: name.trim(),
      min_select: minSelect,
      max_select: maxSelect,
      sort_order: count ?? 0,
    })
    .select("id, name, min_select, max_select, sort_order")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to create option group" }, { status: 500 });
  }
  return NextResponse.json({ group: { ...data, menu_item_options: [] } });
}
