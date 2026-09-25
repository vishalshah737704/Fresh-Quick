// mock_card / mock_upi resolve randomly at this success rate; mock_cod
// always succeeds (paying on delivery can't fail at order time).
export const PAYMENT_SUCCESS_RATE = 0.8;

// Phase 4: vendor-drivable status chain. Each key maps to the one status
// a vendor may advance an order to next; statuses past "ready" belong to
// delivery/admin (Phase 5/6) and are not vendor-editable.
export const VENDOR_STATUS_TRANSITIONS: Record<string, string> = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "ready",
};

// Phase 5: delivery-partner-drivable status chain. "assigned" is entered
// via the claim endpoint, not this map (claim is a special first
// transition guarded by its own ready+unassigned check, not a simple
// status->status lookup).
export const DELIVERY_STATUS_TRANSITIONS: Record<string, string> = {
  assigned: "picked_up",
  picked_up: "delivered",
};
