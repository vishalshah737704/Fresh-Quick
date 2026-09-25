import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";

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

  const { data: payment, error: paymentError } = await supabaseServer
    .from("payments")
    .update({
      status,
      paid_at: status === "success" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id, order_id, status")
    .single();

  if (paymentError || !payment) {
    return NextResponse.json({ error: "Payment is not pending" }, { status: 409 });
  }

  if (status === "failed") {
    const { error: cancelError } = await supabaseServer
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", payment.order_id)
      .eq("status", "placed");
    if (cancelError) {
      console.error("Failed to cancel order after payment failure:", payment.order_id, cancelError);
    }
  }

  return NextResponse.json({ payment });
}
