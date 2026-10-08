import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { channelEnv, sendExpoPush, sendTwilio } from "@/lib/notify-channels";
import { planDispatch, toPreferences, type DispatchMessage, type RawPreferencesRow } from "@/lib/notify-model";

const BATCH = 50;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// The "Notify router": called by n8n workflow 10 every minute (and on demand). Claims inbox rows
// that were never dispatched (atomic: the update re-checks dispatched_at is null), then sends the
// extra channels each recipient has enabled. The inbox row is the in-app channel and already exists.
export async function POST(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { data: pending, error } = await supabaseServer
    .from("user_notifications")
    .select("id")
    .is("dispatched_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ error: "Failed to read notifications" }, { status: 500 });
  if (!pending || pending.length === 0) return NextResponse.json({ claimed: 0, push: 0, sms: 0, whatsapp: 0, skipped: 0 });

  const { data: claimed, error: claimError } = await supabaseServer
    .from("user_notifications")
    .update({ dispatched_at: new Date().toISOString() })
    .in("id", pending.map((p) => p.id))
    .is("dispatched_at", null)
    .select("id, user_id, kind, title, body, order_id, created_at");
  if (claimError) return NextResponse.json({ error: "Failed to claim notifications" }, { status: 500 });
  const rows = claimed ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [prefsRes, tokensRes, usersRes] = await Promise.all([
    supabaseServer.from("notification_preferences").select("user_id, order_updates, wallet_updates, promotions, push, sms, whatsapp").in("user_id", userIds),
    supabaseServer.from("device_tokens").select("user_id, token").in("user_id", userIds),
    supabaseServer.from("users").select("id, phone").in("id", userIds),
  ]);
  const prefsBy = new Map((prefsRes.data ?? []).map((p) => [p.user_id, toPreferences(p as RawPreferencesRow)]));
  const tokensBy = new Map<string, string[]>();
  for (const t of tokensRes.data ?? []) tokensBy.set(t.user_id, [...(tokensBy.get(t.user_id) ?? []), t.token]);
  const phoneBy = new Map((usersRes.data ?? []).map((u) => [u.id, u.phone as string | null]));
  const env = channelEnv();

  const messages: DispatchMessage[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (Date.now() - Date.parse(row.created_at) > MAX_AGE_MS) {
      skipped += 1;
      continue;
    }
    messages.push(
      ...planDispatch(
        { title: row.title, body: row.body, kind: row.kind, orderId: row.order_id },
        prefsBy.get(row.user_id) ?? toPreferences(null),
        tokensBy.get(row.user_id) ?? [],
        phoneBy.get(row.user_id) ?? null,
        env
      )
    );
  }

  const pushResults = await sendExpoPush(messages.filter((m): m is Extract<DispatchMessage, { channel: "push" }> => m.channel === "push"));
  const twilioResults = await Promise.all(
    messages.filter((m): m is Extract<DispatchMessage, { channel: "sms" | "whatsapp" }> => m.channel !== "push").map(sendTwilio)
  );
  const dead = pushResults.map((r) => r.invalidToken).filter((t): t is string => Boolean(t));
  if (dead.length > 0) await supabaseServer.from("device_tokens").delete().in("token", dead);

  return NextResponse.json({
    claimed: rows.length,
    push: pushResults.filter((r) => r.ok).length,
    sms: twilioResults.filter((r) => r.ok && r.channel === "sms").length,
    whatsapp: twilioResults.filter((r) => r.ok && r.channel === "whatsapp").length,
    skipped,
  });
}
