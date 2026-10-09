import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { statusAnswer } from "@/lib/registration-model";
import { ipBucket, normalizeEmail, parseStatusLimit } from "@/lib/registration-status-bucket";
import { clientIpFromForwarded, parseTrustedHops } from "@/lib/zippy/client-ip";

// Tells the login page why a banned account cannot sign in. Reveals only pending / rejected for
// customers; never the rejection reason (that goes by email). Unknown and approved emails both answer "none".
export async function POST(request: NextRequest) {
  const ip = clientIpFromForwarded(
    request.headers.get("x-forwarded-for"),
    parseTrustedHops(process.env.ZIPPY_TRUSTED_PROXY_HOPS)
  );
  const bucket = ipBucket(ip, (value) => createHash("sha256").update(value).digest("hex").slice(0, 16));
  const { data: allowed, error: limitError } = await supabaseServer.rpc("zippy_hit", {
    p_bucket: bucket,
    p_window_seconds: 60,
    p_limit: parseStatusLimit(process.env.REGISTRATION_STATUS_LIMIT_PER_MINUTE),
  });
  if (limitError) return NextResponse.json({ error: "Please try again in a moment" }, { status: 502 });
  if (allowed === false) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ status: "none" });

  const { data, error } = await supabaseServer.rpc("registration_state_by_email", { p_email: email });
  if (error) return NextResponse.json({ error: "Please try again in a moment" }, { status: 502 });
  const row = Array.isArray(data) ? data[0] : null;
  return NextResponse.json({
    status: statusAnswer(row ? { role: row.role, approvalStatus: row.approval_status } : null),
  });
}
