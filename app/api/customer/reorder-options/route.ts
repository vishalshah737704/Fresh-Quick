import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { pickReorderStores, type RecentOrderRow } from "@/lib/favorites-model";

export async function GET(request: NextRequest) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, store_id, status, placed_at, stores(id, name, banner_url, is_open, is_suspended)")
    .eq("customer_id", who.userId)
    .order("placed_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: "Failed to load recent orders" }, { status: 500 });
  return NextResponse.json({ options: pickReorderStores((data ?? []) as unknown as RecentOrderRow[]) });
}
