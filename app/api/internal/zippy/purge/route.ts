import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { supabaseServer } from "@/lib/supabase-server";
import { parseDryRun, parseRetentionDays } from "@/lib/zippy/retention";

// Called by n8n workflow 08 (nightly + on demand) to delete Zippy chats with no activity inside the retention window.
// Dry run unless the body is {"dryRun": false}.
export async function POST(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const dryRun = parseDryRun(body);
  const rawDays = process.env.ZIPPY_RETENTION_DAYS;
  const retentionDays = parseRetentionDays(rawDays);
  if (rawDays !== undefined && rawDays !== "" && String(retentionDays) !== rawDays.trim()) {
    console.warn(`ZIPPY_RETENTION_DAYS is invalid, using ${retentionDays} days`);
  }
  let data: unknown;
  try {
    const result = await supabaseServer.rpc("purge_zippy_chats", {
      p_retention_days: retentionDays,
      p_dry_run: dryRun,
    });
    if (result.error) throw result.error;
    data = result.data;
  } catch (error) {
    console.error("zippy purge failed", error);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { conversations?: number; messages?: number; usage_rows?: number }
    | null
    | undefined;
  return NextResponse.json({
    dryRun,
    retentionDays,
    conversations: row?.conversations ?? 0,
    messages: row?.messages ?? 0,
    usageRows: row?.usage_rows ?? 0,
  });
}
