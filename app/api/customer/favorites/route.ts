import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";

export async function GET(request: NextRequest) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { data, error } = await supabaseServer
    .from("favorite_stores")
    .select("store_id")
    .eq("user_id", who.userId);
  if (error) return NextResponse.json({ error: "Failed to load favorites" }, { status: 500 });
  return NextResponse.json({ storeIds: (data ?? []).map((row) => row.store_id as string) });
}
