import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveUser } from "@/lib/user-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Body: {"all": true} or {"ids": [uuid, ...]} (at most 100). Only the caller's own rows can change.
export async function POST(request: NextRequest) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const body = (await request.json().catch(() => null)) as { all?: unknown; ids?: unknown } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let query = supabaseServer
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", who.userId)
    .is("read_at", null);
  if (body.all === true) {
    // everything unread
  } else if (Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= 100 && body.ids.every((id) => typeof id === "string" && UUID.test(id))) {
    query = query.in("id", body.ids as string[]);
  } else {
    return NextResponse.json({ error: "Send all: true or a list of ids" }, { status: 400 });
  }
  const { error } = await query;
  if (error) return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
