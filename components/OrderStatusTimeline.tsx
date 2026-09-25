type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled";

const STEPS = ["Placed", "Preparing", "On the way", "Delivered"] as const;

// Total mapping across all 8 real order statuses onto the 4 display steps.
// Every OrderStatus value except "cancelled" appears on the right-hand side
// exactly once via one of these keys.
const STEP_INDEX: Record<Exclude<OrderStatus, "cancelled">, number> = {
  placed: 0,
  accepted: 0,
  preparing: 1,
  ready: 1,
  assigned: 2,
  picked_up: 2,
  delivered: 3,
};

export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Order cancelled
      </div>
    );
  }

  const currentIndex = STEP_INDEX[status];

  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  complete || active
                    ? "bg-brand-primary text-white"
                    : "bg-brand-ink-muted/15 text-brand-ink-muted"
                }`}
              >
                {complete ? "✓" : index + 1}
              </div>
              <span
                className={`text-xs ${
                  active ? "font-semibold text-brand-ink" : "text-brand-ink-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 ${
                  complete ? "bg-brand-primary" : "bg-brand-ink-muted/15"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
