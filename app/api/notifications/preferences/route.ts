import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveUser } from "@/lib/user-auth";
import { toPreferences, validatePreferencesPatch, type RawPreferencesRow } from "@/lib/notify-model";

const COLUMNS = "order_updates, wallet_updates, promotions, push, sms, whatsapp";

export async function GET(request: NextRequest) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { data, error } = await supabaseServer
    .from("notification_preferences")
    .select(COLUMNS)
    .eq("user_id", who.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  return NextResponse.json({ preferences: toPreferences(data as RawPreferencesRow | null) });
}

export async function PUT(request: NextRequest) {
  const who = await resolveUser(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const body = await request.json().catch(() => null);
  const parsed = validatePreferencesPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await supabaseServer
    .from("notification_preferences")
    .upsert({ user_id: who.userId, ...parsed.patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  return NextResponse.json({ preferences: toPreferences(data as RawPreferencesRow) });
}
