import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

async function resolveUserId(request: NextRequest): Promise<{ userId: string } | { error: string; status: number }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: "Missing Authorization header", status: 401 };
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Invalid or expired session", status: 401 };
  }
  return { userId: userData.user.id };
}

export async function GET(request: NextRequest) {
  const resolved = await resolveUserId(request);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data, error } = await supabaseServer
    .from("carts")
    .select("store_id, store_name, items, order_note")
    .eq("user_id", resolved.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load cart" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ cart: null });
  }
  return NextResponse.json({
    cart: {
      storeId: data.store_id,
      storeName: data.store_name,
      items: data.items,
      orderNote: data.order_note,
    },
  });
}

export async function PUT(request: NextRequest) {
  const resolved = await resolveUserId(request);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray(body.items) ||
    typeof body.orderNote !== "string" ||
    !(body.storeId === null || typeof body.storeId === "string") ||
    !(body.storeName === null || typeof body.storeName === "string")
  ) {
    return NextResponse.json({ error: "Invalid cart payload" }, { status: 400 });
  }

  const { error } = await supabaseServer.from("carts").upsert({
    user_id: resolved.userId,
    store_id: body.storeId,
    store_name: body.storeName,
    items: body.items,
    order_note: body.orderNote,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: "Failed to save cart" }, { status: 500 });
  }

  return NextResponse.json({
    cart: { storeId: body.storeId, storeName: body.storeName, items: body.items, orderNote: body.orderNote },
  });
}
