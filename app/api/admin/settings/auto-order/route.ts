import { NextRequest, NextResponse } from "next/server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { parseEnabledBody } from "@/lib/auto-order";
import { getAutoOrderEnabled, setAutoOrderEnabled } from "@/lib/auto-order-server";

// The app runs on the host and n8n publishes 5678, so localhost is right here (n8n itself uses host.docker.internal).
const N8N_BASE_URL = process.env.N8N_BASE_URL ?? "http://localhost:5678";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  return NextResponse.json({ enabled: await getAutoOrderEnabled() });
}

export async function PUT(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const enabled = parseEnabledBody(await request.json().catch(() => null));
  if (enabled === null) {
    return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
  }
  if (!(await setAutoOrderEnabled(enabled))) {
    return NextResponse.json({ error: "Failed to save the setting" }, { status: 500 });
  }
  let sweepStarted = false;
  if (enabled) {
    // Best effort: the setting is saved either way; n8n being down only means open orders are not nudged.
    try {
      const res = await fetch(`${N8N_BASE_URL}/webhook/foodhub/auto-order-sweep`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      sweepStarted = res.ok;
    } catch {
      sweepStarted = false;
    }
  }
  return NextResponse.json({ enabled, sweepStarted });
}
