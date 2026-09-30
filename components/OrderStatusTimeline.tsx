import { TIMELINE_STEPS, TIMELINE_STEP_INDEX, type OrderStatus } from "@/lib/order-status";

export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Order cancelled
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Restaurant rejected your order — payment refunded
      </div>
    );
  }

  const currentIndex = TIMELINE_STEP_INDEX[status];

  return (
    <ol className="flex items-start gap-1">
      {TIMELINE_STEPS.map((label, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={label} className="flex flex-1 items-start gap-1 last:flex-none">
            <div className="flex w-14 flex-col items-center gap-1 text-center sm:w-16">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  complete
                    ? "bg-brand-accent-text-safe text-white"
                    : active
                    ? "bg-brand-primary-text-safe text-white"
                    : "bg-brand-ink-muted/20 text-brand-ink-muted"
                }`}
              >
                {complete ? "✓" : index + 1}
              </div>
              <span
                className={`text-[11px] leading-tight sm:text-xs ${
                  active ? "font-semibold text-brand-ink" : "text-brand-ink-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {index < TIMELINE_STEPS.length - 1 && (
              <div
                className={`mt-3.5 h-0.5 flex-1 ${
                  complete ? "bg-brand-accent" : "bg-brand-ink-muted/20"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
