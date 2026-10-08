// Pure: where a tapped push notification should open. Imports nothing at runtime.
export type PushRole = "customer" | "delivery";

export function pushTapTarget(role: string | null | undefined, data: unknown): string | null {
  if (role !== "customer" && role !== "delivery") return null;
  const orderId =
    typeof data === "object" && data !== null && typeof (data as { orderId?: unknown }).orderId === "string"
      ? (data as { orderId: string }).orderId
      : null;
  if (role === "customer" && orderId && /^[0-9a-f-]{36}$/i.test(orderId)) return `/customer/orders/${orderId}`;
  return role === "customer" ? "/customer/notifications" : "/delivery/notifications";
}
