import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";
import { assertOwnsGroup } from "@/lib/vendor-option-auth";

export async function PATCH(
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
  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    update.name = body.name.trim();
  }
  if (body.minSelect !== undefined) {
    if (!Number.isInteger(body.minSelect) || body.minSelect < 0) {
      return NextResponse.json(
        { error: "minSelect must be a non-negative integer" },
        { status: 400 }
      );
    }
    update.min_select = body.minSelect;
  }
  if (body.maxSelect !== undefined) {
    if (!Number.isInteger(body.maxSelect) || body.maxSelect < 1) {
      return NextResponse.json(
        { error: "maxSelect must be a positive integer" },
        { status: 400 }
      );
    }
    update.max_select = body.maxSelect;
  }
  if (
    typeof update.min_select === "number" &&
    typeof update.max_select === "number" &&
    update.max_select < update.min_select
  ) {
    return NextResponse.json({ error: "maxSelect must be >= minSelect" }, { status: 400 });
  }
  const { data, error } = await supabaseServer
    .from("menu_item_option_groups")
    .update(update)
    .eq("id", groupId)
    .select("id, name, min_select, max_select, sort_order")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to update option group" }, { status: 500 });
  }
  return NextResponse.json({ group: data });
}

export async function DELETE(
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
  const { error } = await supabaseServer
    .from("menu_item_option_groups")
    .delete()
    .eq("id", groupId);
  if (error) {
    return NextResponse.json({ error: "Failed to delete option group" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
