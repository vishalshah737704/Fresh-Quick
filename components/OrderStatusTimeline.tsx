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
    <ol className="flex items-stretch gap-0.5">
      {TIMELINE_STEPS.map((label, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={label} className="flex flex-1 min-w-0 flex-col items-center gap-1 last:flex-none">
            <div
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                complete
                  ? "bg-brand-accent-text-safe text-white"
                  : active
                  ? "bg-brand-primary-text-safe text-white"
                  : "bg-brand-ink-muted/20 text-brand-ink-muted"
              }`}
            >
              {complete ? "✓" : index + 1}
            </div>
            {index < TIMELINE_STEPS.length - 1 && (
              <div
                className={`h-0.5 w-full flex-shrink-0 ${
                  complete ? "bg-brand-accent" : "bg-brand-ink-muted/20"
                }`}
              />
            )}
            <span
              className={`break-words text-center text-[10px] leading-tight ${
                active ? "font-semibold text-brand-ink" : "text-brand-ink-muted"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
