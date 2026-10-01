import { ItemThumb } from "@/components/ItemThumb";
import { formatPaise, type OrderDetail } from "@/lib/order-detail";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/order-status";

export function DeliveryOrderCard({
  order,
  scope,
  busy = false,
  onClaim,
  onAdvance,
}: {
  order: OrderDetail;
  scope: "available" | "active" | "history";
  busy?: boolean;
  onClaim?: () => void;
  onAdvance?: () => void;
}) {
  const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const advanceLabel =
    order.status === "assigned"
      ? "Mark picked up"
      : order.status === "picked_up"
        ? "Mark delivered"
        : null;
  const historyWhen = order.deliveredAt ?? order.placedAt;

  return (
    <div className="flex min-w-0 flex-col gap-3 [overflow-wrap:anywhere] rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-lg font-bold text-brand-ink">#{order.id.slice(0, 8)}</p>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[order.status]}`}
          >
            {STATUS_LABEL[order.status]}
          </span>
        </div>
        <p className="ml-auto text-lg font-bold text-brand-ink">
          {formatPaise(Math.round(order.total * 100))}
        </p>
      </div>

      <div className="rounded-lg bg-brand-accent-tint p-2 text-base">
        <p className="font-semibold text-brand-ink">Pickup — {order.storeName}</p>
        <p className="text-brand-ink-muted">
          {order.storeAddress ? order.storeAddress.lines.join(", ") : "Address not on file"}
        </p>
      </div>

      {scope === "available" && (
        <p className="text-base text-brand-ink-muted">
          Customer details appear after you accept.
        </p>
      )}

      {scope === "active" && (
        <div className="rounded-lg bg-brand-primary-tint p-2 text-base">
          <p className="font-semibold text-brand-ink">Drop-off — {order.recipientName}</p>
          <p className="text-brand-ink-muted">
            {order.recipientPhone.startsWith("+") ? (
              <a
                href={`tel:${order.recipientPhone}`}
                className="font-medium text-brand-primary-text-safe underline"
              >
                {order.recipientPhone}
              </a>
            ) : (
              order.recipientPhone
            )}
          </p>
          {order.address ? (
            <>
              {order.address.label && (
                <p className="font-medium text-brand-ink">{order.address.label}</p>
              )}
              <p className="text-brand-ink-muted">{order.address.lines.join(", ")}</p>
            </>
          ) : (
            <p className="text-brand-ink-muted">No delivery address on file</p>
          )}
          {order.deliveryNote && (
            <p className="text-brand-ink-muted">Note: &quot;{order.deliveryNote}&quot;</p>
          )}
        </div>
      )}

      {scope === "history" && (
        <p className="text-base text-brand-ink-muted">
          {order.status === "delivered"
            ? `Delivered to ${order.recipientName}`
            : STATUS_LABEL[order.status]}
          {" · "}
          {new Date(historyWhen).toLocaleString()}
        </p>
      )}

      {scope === "history" ? (
        <p className="line-clamp-2 text-base text-brand-ink">
          {totalQty} {totalQty === 1 ? "item" : "items"}:{" "}
          {order.items.map((item) => item.name).join(", ")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 text-base text-brand-ink">
              <ItemThumb url={item.imageUrl} name={item.name} size={40} />
              <div className="min-w-0">
                <p className="font-medium">
                  {item.quantity}× {item.name}
                </p>
                {item.options.length > 0 && (
                  <p className="text-sm text-brand-ink-muted">
                    {item.options.map((option) => option.optionName).join(", ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {scope === "available" && onClaim && (
        <div>
          <button
            onClick={onClaim}
            disabled={busy}
            className="rounded-full bg-brand-accent-text-safe px-4 py-2 text-base font-semibold text-white disabled:opacity-50"
          >
            Accept
          </button>
        </div>
      )}

      {scope === "active" && advanceLabel && onAdvance && (
        <div>
          <button
            onClick={onAdvance}
            disabled={busy}
            className="rounded-full bg-brand-primary-text-safe px-4 py-2 text-base font-semibold text-white disabled:opacity-50"
          >
            {advanceLabel}
          </button>
        </div>
      )}
    </div>
  );
}
