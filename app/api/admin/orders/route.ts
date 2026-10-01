import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import {
  ADMIN_ORDER_SELECT,
  normalizeAdminOrderRow,
  type RawAdminOrderRow,
} from "@/lib/admin-order-view";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const statusFilter = request.nextUrl.searchParams.get("status");
  let query = supabaseServer
    .from("orders")
    .select(ADMIN_ORDER_SELECT)
    .order("placed_at", { ascending: false });
  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
  return NextResponse.json({
    orders: (data as unknown as RawAdminOrderRow[]).map(normalizeAdminOrderRow),
  });
}
