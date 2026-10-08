"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoleGuard } from "@/lib/auth";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { OrderDetailView } from "@/components/OrderDetailView";
import MapErrorBoundary from "@/components/maps/MapErrorBoundary";
import OrderTrackingMap from "@/components/maps/OrderTrackingMap";
import { showTrackingMap } from "@/lib/maps/tracking";
import { DeliveryAnimationDialog } from "@/components/DeliveryAnimationDialog";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  type OrderDetail,
  type RawOrderDetail,
} from "@/lib/order-detail";
import { STATUS_MESSAGE, isTerminalStatus } from "@/lib/order-status";
import { useReorder } from "@/lib/use-reorder";
import { useOrderReview } from "@/lib/use-order-review";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { OwnReviewView } from "@/components/reviews/OwnReviewView";
import { PartnerScoreLine } from "@/components/reviews/PartnerScoreLine";

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
  const [sawPickedUp, setSawPickedUp] = useState(false);
  const { busyOrderId, notice, error: reorderError, reorder } = useReorder();
  const review = useOrderReview(params.id, order?.status ?? null);

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
      if (detail.status === "picked_up") setSawPickedUp(true);
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
  const showAnimation =
    !dismissed &&
    (order.status === "picked_up" || (sawPickedUp && order.status === "delivered") || celebrating);

  return (
    <div className="-m-4 flex flex-col gap-6 bg-brand-bg pb-6">
      {showAnimation && (
        <DeliveryAnimationDialog
          orderId={order.id}
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

            {showTrackingMap(order.status) && (
              <MapErrorBoundary>
                <OrderTrackingMap
                  status={order.status}
                  store={order.storePoint}
                  destination={order.deliveryPoint}
                  partnerLocation={partnerLocation}
                />
              </MapErrorBoundary>
            )}

            <OrderDetailView order={order} />

            {review.state?.partnerScore && order.deliveryPartnerId && <PartnerScoreLine score={review.state.partnerScore} />}
            {review.state?.eligible && (
              <ReviewForm state={review.state} submitting={review.submitting} error={review.error} onSubmit={review.submit} />
            )}
            {review.state?.review && <OwnReviewView review={review.state.review} />}

            {order.status !== "cancelled" && order.status !== "rejected" && (
              <div>
                {notice && <p className="mb-2 text-sm text-brand-ink-muted" role="status">{notice}</p>}
                {reorderError && <p className="mb-2 text-sm text-red-600" role="alert">{reorderError}</p>}
                <button
                  type="button"
                  disabled={busyOrderId !== null}
                  onClick={() => reorder(order.id)}
                  className="rounded-[var(--radius-pill)] bg-brand-primary px-5 py-2 font-semibold text-white disabled:opacity-50"
                >
                  {busyOrderId === order.id ? "Adding…" : "Reorder"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
