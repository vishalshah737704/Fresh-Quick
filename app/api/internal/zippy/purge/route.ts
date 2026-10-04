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
  const retentionDays = parseRetentionDays(process.env.ZIPPY_RETENTION_DAYS);
  const { data, error } = await supabaseServer.rpc("purge_zippy_chats", {
    p_retention_days: retentionDays,
    p_dry_run: dryRun,
  });
  if (error) {
    console.error("zippy purge failed", error);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    dryRun,
    retentionDays,
    conversations: row?.conversations ?? 0,
    messages: row?.messages ?? 0,
    usageRows: row?.usage_rows ?? 0,
  });
}
