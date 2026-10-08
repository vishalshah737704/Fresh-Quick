import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveUser } from "@/lib/user-auth";
import { validateDeviceToken } from "@/lib/notify-model";

// Registers (or re-assigns) the caller's phone for push. A token belongs to one account at a
// time: signing in as someone else on the same phone moves it, so the previous account stops
// receiving pushes on that device.
export async function POST(request: NextRequest) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const body = (await request.json().catch(() => null)) as { token?: unknown; platform?: unknown } | null;
  const parsed = validateDeviceToken(body?.token, body?.platform);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { error } = await supabaseServer.from("device_tokens").upsert(
    { user_id: who.userId, token: parsed.token, platform: parsed.platform, last_seen_at: new Date().toISOString() },
    { onConflict: "token" }
  );
  if (error) return NextResponse.json({ error: "Failed to register device" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== "string") return NextResponse.json({ error: "Invalid push token" }, { status: 400 });
  const { error } = await supabaseServer.from("device_tokens").delete().eq("token", body.token).eq("user_id", who.userId);
  if (error) return NextResponse.json({ error: "Failed to remove device" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
