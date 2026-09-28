import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { applyPaymentResult } from "@/lib/mock-payment";

// Called by n8n's "Payment Mock Confirmation" workflow (spec §5 workflow 2)
// after it simulates a gateway delay. Writes the payment result and, on
// success, advances the order past its pending-payment state. This is the
// async counterpart to Phase 3's synchronous in-checkout payment
// resolution — that path is still the one actually exercised by the app
// today; this route exists for a real n8n instance to call once wired up.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  let status: unknown;
  try {
    const body = await request.json();
    status = body?.status;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (status !== "success" && status !== "failed") {
    return NextResponse.json({ error: "status must be 'success' or 'failed'" }, { status: 400 });
  }

  const result = await applyPaymentResult(id, status);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({ payment: { id, status } });
}
