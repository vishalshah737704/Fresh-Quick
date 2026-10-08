import type { ReactNode } from "react";
import { ItemThumb } from "@/components/ItemThumb";
import { formatPaise, formatPayment, lineTotalPaise, type OrderDetail } from "@/lib/order-detail";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/order-status";

function rupees(amount: number): string {
  return formatPaise(Math.round(amount * 100));
}

export function OrderDetailView({
  order,
  children,
}: {
  order: OrderDetail;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 text-brand-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{order.storeName}</p>
          <p className="text-sm text-brand-ink-muted">
            Order #{order.id.slice(0, 8)} · {new Date(order.placedAt).toLocaleString()}
          </p>
          {order.storeAddress && (
            <p className="text-sm text-brand-ink-muted">
              Pickup: {order.storeAddress.lines.join(", ")}
            </p>
          )}
        </div>
        <span className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm font-medium ${STATUS_COLOR[order.status]}`}>
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <section className="rounded-[var(--radius-card)] bg-brand-primary-tint p-4">
        <h3 className="mb-1 text-sm font-semibold text-brand-primary-text-safe">Deliver to</h3>
        <p className="font-medium">{order.recipientName}</p>
        <p className="text-sm text-brand-ink-muted">{order.recipientEmail}</p>
        <p className="text-sm text-brand-ink-muted">
          {order.recipientPhone.startsWith("+") ? (
            <a href={`tel:${order.recipientPhone}`} className="underline">
              {order.recipientPhone}
            </a>
          ) : (
            order.recipientPhone
          )}
        </p>
        {order.address ? (
          <div className="mt-2 text-sm">
            {order.address.label && <p className="font-medium">{order.address.label}</p>}
            {order.address.lines.map((line, index) => (
              <p key={`${index}-${line}`}>{line}</p>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-brand-ink-muted">No delivery address on file</p>
        )}
        {order.deliveryNote && (
          <p className="mt-2 text-sm">
            <span className="font-medium">Note:</span> &quot;{order.deliveryNote}&quot;
          </p>
        )}
      </section>

      <section className="rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-brand-ink-muted">
          Items ({order.items.reduce((sum, item) => sum + item.quantity, 0)})
        </h3>
        <ul className="flex flex-col gap-3">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <ItemThumb url={item.imageUrl} name={item.name} />
              <div className="min-w-0 flex-1">
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
              <p className="shrink-0 font-medium">
                {formatPaise(lineTotalPaise(item.unitPrice, item.quantity))}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[var(--radius-card)] bg-brand-accent-tint p-3">
          <p className="text-xs font-medium text-brand-accent-text-safe">Subtotal</p>
          <p className="text-base font-semibold">{rupees(order.subtotal)}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-brand-accent-tint p-3">
          <p className="text-xs font-medium text-brand-accent-text-safe">Delivery fee</p>
          <p className="text-base font-semibold">{rupees(order.deliveryFee)}</p>
        </div>
        {order.discount > 0 && (
          <div className="rounded-[var(--radius-card)] bg-brand-accent-tint p-3">
            <p className="text-xs font-medium text-brand-accent-text-safe">
              Discount{order.couponCode ? ` (${order.couponCode})` : ""}
            </p>
            <p className="text-base font-semibold">-{rupees(order.discount)}</p>
          </div>
        )}
        {order.creditUsed > 0 && (
          <div className="rounded-[var(--radius-card)] bg-brand-accent-tint p-3">
            <p className="text-xs font-medium text-brand-accent-text-safe">Wallet credit</p>
            <p className="text-base font-semibold">-{rupees(order.creditUsed)}</p>
          </div>
        )}
        <div className="rounded-[var(--radius-card)] bg-brand-accent-tint p-3">
          <p className="text-xs font-medium text-brand-accent-text-safe">Total</p>
          <p className="text-lg font-bold">{rupees(order.total)}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-brand-primary-tint p-3">
          <p className="text-xs font-medium text-brand-primary-text-safe">Payment</p>
          <p className="text-base font-semibold">
            {formatPayment(order.payment)}
          </p>
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-4">
        <h3 className="mb-2 text-sm font-semibold text-brand-ink-muted">Timeline</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {[
            { label: "Placed", at: order.placedAt },
            { label: "Accepted", at: order.acceptedAt },
            { label: "Picked up", at: order.pickedUpAt },
            { label: "Delivered", at: order.deliveredAt },
          ].map(
            (entry) =>
              entry.at && (
                <li key={entry.label} className="flex justify-between gap-3">
                  <span className="font-medium">{entry.label}</span>
                  <span className="text-brand-ink-muted">{new Date(entry.at).toLocaleString()}</span>
                </li>
              )
          )}
        </ul>
      </section>

      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
