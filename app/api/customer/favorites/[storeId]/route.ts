import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { uuidsOnly } from "@/lib/zippy/actions";

type Ctx = { params: Promise<{ storeId: string }> };

async function parse(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return { response: NextResponse.json({ error: who.error }, { status: who.status }) };
  const { storeId } = await ctx.params;
  if (uuidsOnly([storeId]).length !== 1) return { response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  return { userId: who.userId, storeId };
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const parsed = await parse(request, ctx);
  if ("response" in parsed) return parsed.response;
  const { data: store, error: storeError } = await supabaseServer
    .from("stores")
    .select("id")
    .eq("id", parsed.storeId)
    .maybeSingle();
  if (storeError) return NextResponse.json({ error: "Failed to save favorite" }, { status: 500 });
  if (!store) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { error } = await supabaseServer
    .from("favorite_stores")
    .upsert({ user_id: parsed.userId, store_id: parsed.storeId }, { onConflict: "user_id,store_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: "Failed to save favorite" }, { status: 500 });
  return NextResponse.json({ favorite: true });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const parsed = await parse(request, ctx);
  if ("response" in parsed) return parsed.response;
  const { error } = await supabaseServer
    .from("favorite_stores")
    .delete()
    .eq("user_id", parsed.userId)
    .eq("store_id", parsed.storeId);
  if (error) return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
  return NextResponse.json({ favorite: false });
}
