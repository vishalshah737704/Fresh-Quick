import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveUser } from "@/lib/user-auth";
import type { InboxNotification } from "@/lib/notify-model";

const PAGE_SIZE = 30;

export async function GET(request: NextRequest) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });

  const before = request.nextUrl.searchParams.get("before");
  if (before !== null && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  let query = supabaseServer
    .from("user_notifications")
    .select("id, category, kind, title, body, order_id, read_at, created_at")
    .eq("user_id", who.userId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);

  const [{ data, error }, { count }] = await Promise.all([
    query,
    supabaseServer
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", who.userId)
      .is("read_at", null),
  ]);
  if (error) return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  const rows = data ?? [];
  const page = rows.slice(0, PAGE_SIZE);
  const notifications: InboxNotification[] = page.map((row) => ({
    id: row.id,
    category: row.category,
    kind: row.kind,
    title: row.title,
    body: row.body,
    orderId: row.order_id,
    read: row.read_at !== null,
    createdAt: row.created_at,
  }));
  return NextResponse.json({
    notifications,
    unreadCount: count ?? 0,
    nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].created_at : null,
  });
}
