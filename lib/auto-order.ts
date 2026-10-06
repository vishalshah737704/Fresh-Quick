// Import-free on purpose (node's test runner cannot resolve value imports between lib files).
// Demo mode: when the Admin setting is on, n8n workflow 09 calls runAutoStep 3 s after each
// status event; the status check makes every call safe to repeat or to lose a race.
export const AUTO_ORDER_KEY = "auto_order_acceptance";

// Orders the sweep nudges when the box is ticked.
export const OPEN_AUTO_STATUSES = ["placed", "accepted", "preparing", "ready", "assigned"] as const;

const NEXT: Record<string, string> = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "ready",
  assigned: "picked_up",
};

export function nextAutoStatus(status: string): string | null {
  return Object.prototype.hasOwnProperty.call(NEXT, status) ? NEXT[status] : null;
}

export function parseAutoOrderSetting(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { enabled?: unknown }).enabled === true
  );
}

export function parseEnabledBody(body: unknown): boolean | null {
  if (typeof body !== "object" || body === null) return null;
  const enabled = (body as { enabled?: unknown }).enabled;
  return typeof enabled === "boolean" ? enabled : null;
}

export type AutoStepOrder = { status: string; paymentSucceeded: boolean };

export type AutoStepDeps = {
  readEnabled(): Promise<boolean>;
  readOrder(id: string): Promise<AutoStepOrder | null>;
  // False when the order had already moved off `from` (a manual click or a duplicate event won).
  advance(id: string, from: string, to: string): Promise<boolean>;
  // Re-saves a ready, unassigned order so workflow 04's assignment trigger fires again.
  retriggerAssignment(id: string): Promise<boolean>;
};

export type AutoStepResult =
  | { advanced: true; from: string; to: string }
  | {
      advanced: false;
      reason: "off" | "missing" | "changed" | "no_step" | "payment_pending" | "raced" | "retriggered";
    };

export async function runAutoStep(
  deps: AutoStepDeps,
  id: string,
  expectedStatus: string
): Promise<AutoStepResult> {
  if (!(await deps.readEnabled())) return { advanced: false, reason: "off" };
  const to = nextAutoStatus(expectedStatus);
  if (to === null && expectedStatus !== "ready") return { advanced: false, reason: "no_step" };
  const order = await deps.readOrder(id);
  if (!order) return { advanced: false, reason: "missing" };
  if (order.status !== expectedStatus) return { advanced: false, reason: "changed" };
  if (expectedStatus === "ready") {
    await deps.retriggerAssignment(id);
    return { advanced: false, reason: "retriggered" };
  }
  // A placed order's payment can still be pending; moving on would let a later failure slip through.
  if (expectedStatus === "placed" && !order.paymentSucceeded) {
    return { advanced: false, reason: "payment_pending" };
  }
  const moved = await deps.advance(id, expectedStatus, to as string);
  return moved
    ? { advanced: true, from: expectedStatus, to: to as string }
    : { advanced: false, reason: "raced" };
}
