export const DELIVERY_FEE_RUPEES = 30;

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
