import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export type PaymentApplyResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: string };

// Applies a resolved mock-payment outcome: marks the payment row (only if
// still pending) and, on failure, cancels the parent order (only if still
// placed). Shared by the n8n-callback route and the in-process fallback
// path so "what happens when payment resolves" has exactly one
// implementation regardless of which path decided the outcome.
export async function applyPaymentResult(
  paymentId: string,
  status: "success" | "failed"
): Promise<PaymentApplyResult> {
  const { data: payment, error: paymentError } = await supabaseServer
    .from("payments")
    .update({
      status,
      paid_at: status === "success" ? new Date().toISOString() : null,
    })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id, order_id, status")
    .single();

  if (paymentError || !payment) {
    return { ok: false, reason: "Payment is not pending" };
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

  return { ok: true, orderId: payment.order_id };
}
