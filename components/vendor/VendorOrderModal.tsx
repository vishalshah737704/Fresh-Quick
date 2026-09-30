"use client";

import { useEffect } from "react";
import { OrderDetailView } from "@/components/OrderDetailView";
import { NEXT_LABEL } from "@/components/vendor/VendorOrderCard";
import type { OrderDetail } from "@/lib/order-detail";

export function VendorOrderModal({
  order,
  onClose,
  onAdvance,
  onReject,
  busy = false,
}: {
  order: OrderDetail;
  busy?: boolean;
  onClose: () => void;
  onAdvance: () => void;
  onReject: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order.id.slice(0, 8)} details`}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-card)] bg-brand-bg p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex justify-end">
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-3 py-1 text-lg text-brand-ink-muted hover:bg-brand-ink-muted/10"
          >
            ✕
          </button>
        </div>
        <OrderDetailView order={order}>
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
        </OrderDetailView>
      </div>
    </div>
  );
}
