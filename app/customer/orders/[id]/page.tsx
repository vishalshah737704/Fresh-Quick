"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";

type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled";

type OrderView = {
  id: string;
  status: OrderStatus;
  total: number;
  delivery_partner_id: string | null;
};

type PaymentView = {
  status: "pending" | "success" | "failed";
  method: string;
};

type PartnerLocation = {
  current_lat: number | null;
  current_lng: number | null;
  last_ping_at: string | null;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Order placed — waiting for restaurant",
  accepted: "Restaurant accepted your order",
  preparing: "Restaurant is preparing your order",
  ready: "Order ready for pickup",
  assigned: "Delivery partner assigned",
  picked_up: "Order picked up — on the way",
  delivered: "Delivered",
  cancelled: "Order cancelled",
};

const SHOW_LOCATION_FOR: OrderStatus[] = ["assigned", "picked_up"];

export default function OrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const TERMINAL_STATUSES: OrderStatus[] = ["delivered", "cancelled"];

    async function load() {
      const [{ data: o, error: oErr }, { data: p, error: pErr }] =
        await Promise.all([
          supabase
            .from("orders")
            .select("id, status, total, delivery_partner_id")
            .eq("id", params.id)
            .single(),
          supabase
            .from("payments")
            .select("status, method")
            .eq("order_id", params.id)
            .single(),
        ]);
      if (cancelled) return;
      if (oErr || pErr) {
        setError((oErr ?? pErr)?.message ?? "Failed to load order");
        return;
      }
      setOrder(o);
      setPayment(p);

      // Stop polling if order reached a terminal status
      if (TERMINAL_STATUSES.includes(o.status)) {
        if (interval) clearInterval(interval);
      }

      if (o.delivery_partner_id && SHOW_LOCATION_FOR.includes(o.status)) {
        const { data: loc } = await supabase
          .from("delivery_partners")
          .select("current_lat, current_lng, last_ping_at")
          .eq("user_id", o.delivery_partner_id)
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
  }, [params.id]);

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load order: {error}</p>;
  }

  if (!order || !payment) {
    return <p className="text-gray-500">Loading order…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-ink">Order #{order.id.slice(0, 8)}</h1>
      {payment.status === "failed" ? (
        <p className="text-red-600">
          Payment failed. Your order was not placed — please try checking out
          again.
        </p>
      ) : (
        <>
          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm">
            <OrderStatusTimeline status={order.status} />
            <p className="mt-3 text-sm text-brand-ink-muted">{STATUS_LABEL[order.status]}</p>
          </section>

          {partnerLocation?.current_lat != null && partnerLocation?.current_lng != null && (
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-ink-muted/25 bg-brand-ink-muted/5 px-4 py-8 text-center">
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

          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm text-sm text-brand-ink-muted">
            <p>Total: ₹{order.total.toFixed(2)}</p>
            <p>Payment: {payment.status} ({payment.method})</p>
          </section>
        </>
      )}
    </div>
  );
}
