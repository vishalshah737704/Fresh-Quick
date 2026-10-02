"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoleGuard } from "@/lib/auth";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { OrderDetailView } from "@/components/OrderDetailView";
import { DeliveryAnimationDialog } from "@/components/DeliveryAnimationDialog";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  type OrderDetail,
  type RawOrderDetail,
} from "@/lib/order-detail";
import { STATUS_MESSAGE, isTerminalStatus } from "@/lib/order-status";

type PartnerLocation = {
  current_lat: number | null;
  current_lng: number | null;
  last_ping_at: string | null;
};

const SHOW_LOCATION_FOR = ["assigned", "picked_up"];

export default function OrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const { ready } = useRoleGuard("customer", "/customer/login");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const postComplete = useCallback(async (): Promise<number> => {
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/customer/orders/${params.id}/complete-delivery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      return res.status;
    } catch {
      return 0;
    }
  }, [params.id]);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      const { data, error: loadError } = await supabase
        .from("orders")
        .select(ORDER_DETAIL_SELECT)
        .eq("id", params.id)
        .single();
      if (cancelled) return;
      if (loadError || !data) {
        setError(loadError?.message ?? "Failed to load order");
        return;
      }
      const detail = normalizeOrderDetail(data as unknown as RawOrderDetail);
      setOrder(detail);
      setError(null);

      // Stop polling if order reached a terminal status
      if (isTerminalStatus(detail.status) && interval) clearInterval(interval);

      if (detail.deliveryPartnerId && SHOW_LOCATION_FOR.includes(detail.status)) {
        const { data: loc } = await supabase
          .from("delivery_partners")
          .select("current_lat, current_lng, last_ping_at")
          .eq("user_id", detail.deliveryPartnerId)
          .single();
        if (!cancelled) setPartnerLocation(loc ?? null);
      } else if (!cancelled) {
        setPartnerLocation(null);
      }
    }

    load();
    interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [ready, params.id]);

  if (!ready) {
    return <p className="text-gray-500">Loading…</p>;
  }

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load order: {error}</p>;
  }

  if (!order) {
    return <p className="text-gray-500">Loading order…</p>;
  }

  const paymentFailed = order.payment?.status === "failed";
  const showAnimation = !dismissed && (order.status === "picked_up" || celebrating);

  return (
    <div className="-m-4 flex flex-col gap-6 bg-brand-bg pb-6">
      {showAnimation && (
        <DeliveryAnimationDialog
          pickedUpAt={order.pickedUpAt}
          post={postComplete}
          onDelivered={() => setCelebrating(true)}
          onClose={() => setDismissed(true)}
        />
      )}
      <div className="flex flex-col items-center gap-2 bg-brand-ink px-6 pb-14 pt-8 text-center">
        <span className="text-3xl">
          {paymentFailed || order.status === "cancelled" || order.status === "rejected"
            ? "ℹ️"
            : "✅"}
        </span>
        <h1 className="text-2xl font-bold text-white">Order #{order.id.slice(0, 8)}</h1>
      </div>
      <div className="flex flex-col gap-6 px-6">
        {paymentFailed ? (
          <p className="text-red-600">
            Payment failed. Your order was not placed — please try checking out
            again.
          </p>
        ) : (
          <>
            <section className="-mt-14 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-lg">
              <OrderStatusTimeline status={order.status} />
              {order.status !== "cancelled" && order.status !== "rejected" && (
                <p className="mt-3 text-sm text-brand-ink-muted">{STATUS_MESSAGE[order.status]}</p>
              )}
            </section>

            {partnerLocation?.current_lat != null && partnerLocation?.current_lng != null && (
              <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-brand-ink-muted/25 bg-brand-ink-muted/5 px-4 py-8 text-center">
                <span className="text-2xl">📍</span>
                <p className="text-sm font-medium text-brand-ink">
                  {partnerLocation.current_lat.toFixed(4)}, {partnerLocation.current_lng.toFixed(4)}
                </p>
                {partnerLocation.last_ping_at && (
                  <p className="text-xs text-brand-ink-muted">
                    Updated {new Date(partnerLocation.last_ping_at).toLocaleTimeString()}
                  </p>
                )}
                <p className="mt-1 text-xs text-brand-ink-muted/70">
                  Live map coming soon — showing raw coordinates for now.
                </p>
              </div>
            )}

            <OrderDetailView order={order} />
          </>
        )}
      </div>
    </div>
  );
}
