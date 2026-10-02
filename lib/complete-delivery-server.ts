import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { decideCompletion } from "@/lib/complete-delivery";
import { DELIVERY_ANIMATION_MS, EARLY_TOLERANCE_MS } from "@/lib/delivery-animation";

type Result = { httpStatus: number; body: Record<string, unknown> };

// Applies decideCompletion to the stored order and, if allowed, flips it to
// delivered. The DB trigger + n8n workflow 05 fire off that status change.
export async function completeDelivery(
  orderId: string,
  mode: "customer" | "internal",
  customerId?: string
): Promise<Result> {
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("id, status, picked_up_at, customer_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    return { httpStatus: 500, body: { error: "Failed to load order" } };
  }
  // Someone else's order looks exactly like a missing one (no id probing).
  if (!order || (mode === "customer" && order.customer_id !== customerId)) {
    return { httpStatus: 404, body: { error: "Order not found" } };
  }

  const decision = decideCompletion({
    status: order.status,
    pickedUpAt: order.picked_up_at,
    nowMs: Date.now(),
    mode,
    animationMs: DELIVERY_ANIMATION_MS,
    toleranceMs: EARLY_TOLERANCE_MS,
  });

  if (decision.kind === "already") {
    return { httpStatus: 200, body: { order: { id: order.id, status: "delivered" } } };
  }
  if (decision.kind === "reject") {
    return {
      httpStatus: decision.httpStatus,
      body: { error: decision.error, retryAfterMs: decision.retryAfterMs },
    };
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ status: "delivered" })
    .eq("id", orderId)
    .eq("status", "picked_up")
    .select("id, status")
    .maybeSingle();
  if (updateError) {
    return { httpStatus: 500, body: { error: "Failed to update order" } };
  }
  if (updated) return { httpStatus: 200, body: { order: updated } };

  // Lost a race (other tab / the n8n fallback / admin). Delivered is success.
  const { data: again, error: againError } = await supabaseServer
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (againError) {
    return { httpStatus: 500, body: { error: "Failed to load order" } };
  }
  if (again?.status === "delivered") return { httpStatus: 200, body: { order: again } };
  return { httpStatus: 409, body: { error: "Order status changed, please refresh" } };
}
