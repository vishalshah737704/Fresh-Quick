import { ItemThumb } from "@/components/ItemThumb";
import { formatPaise, type OrderDetail } from "@/lib/order-detail";

export const NEXT_LABEL: Record<string, string> = {
  placed: "Accept order",
  accepted: "Start preparing",
  preparing: "Mark ready",
};

export function VendorOrderCard({
  order,
  onOpen,
  onAdvance,
  onReject,
  busy = false,
}: {
  order: OrderDetail;
  busy?: boolean;
  onOpen: () => void;
  onAdvance: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-lg font-bold text-brand-ink">#{order.id.slice(0, 8)}</p>
        <p className="text-lg font-bold text-brand-ink">
          {formatPaise(Math.round(order.total * 100))}
        </p>
      </div>

      <div className="rounded-lg bg-brand-primary-tint p-2 text-base">
        <p className="font-semibold text-brand-ink">For: {order.recipientName}</p>
        <p className="text-brand-ink-muted">Phone: {order.recipientPhone}</p>
        <p className="text-brand-ink-muted">
          Payment: {order.payment ? `${order.payment.status} (${order.payment.method})` : "—"}
        </p>
        {order.address ? (
          <p className="text-brand-ink-muted">{order.address.lines.join(", ")}</p>
        ) : (
          <p className="text-brand-ink-muted">No delivery address on file</p>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 text-base text-brand-ink">
            <ItemThumb url={item.imageUrl} name={item.name} size={48} />
            <div className="min-w-0">
              <p className="font-medium">
                {item.quantity}× {item.name}
              </p>
              {item.options.length > 0 && (
                <p className="text-sm text-brand-ink-muted">
                  {item.options.map((option) => option.optionName).join(", ")}
                </p>
              )}
              {item.specialInstructions && (
                <p className="text-sm text-brand-ink-muted">
                  &quot;{item.specialInstructions}&quot;
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {order.deliveryNote && (
        <p className="text-base text-brand-ink-muted">Note: &quot;{order.deliveryNote}&quot;</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {order.status === "placed" && (
          <button
            onClick={onReject}
            disabled={busy}
            className="rounded-full border border-red-600 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50"
          >
            Reject
          </button>
        )}
        {NEXT_LABEL[order.status] && (
          <button
            onClick={onAdvance}
            disabled={busy}
            className="rounded-full bg-brand-primary-text-safe px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {NEXT_LABEL[order.status]}
          </button>
        )}
        <button
          onClick={onOpen}
          className="ml-auto text-sm font-medium text-brand-primary-text-safe underline"
        >
          Full details
        </button>
      </div>
    </div>
  );
}
