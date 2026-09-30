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
    <div>
      <ol className="grid grid-cols-6">
        {TIMELINE_STEPS.map((label, index) => {
          const complete = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={label} className="relative flex min-w-0 flex-col items-center gap-1 text-center">
              {index > 0 && (
                <div
                  aria-hidden="true"
                  className={`absolute right-1/2 top-[11px] h-0.5 w-full ${
                    index <= currentIndex ? "bg-brand-accent" : "bg-brand-ink-muted/20"
                  }`}
                />
              )}
              <div
                className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
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
                className={`hidden text-xs leading-tight sm:block ${
                  active ? "font-semibold text-brand-ink" : "text-brand-ink-muted"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-center text-xs font-semibold text-brand-ink sm:hidden">
        Step {currentIndex + 1} of {TIMELINE_STEPS.length} · {TIMELINE_STEPS[currentIndex]}
      </p>
    </div>
  );
}
