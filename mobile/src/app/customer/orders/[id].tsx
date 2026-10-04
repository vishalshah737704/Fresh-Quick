import { useState, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, Linking, StyleSheet } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { apiFetch, ApiError } from "../../../../lib/api";
import { DeliveryAnimation } from "../../../../components/DeliveryAnimation";
import {
  STATUS_MESSAGE,
  TIMELINE_STEP_INDEX,
  SHOW_LOCATION_FOR_STATUS,
  isTerminalStatus,
  type OrderStatus,
} from "../../../../lib/order-status";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  formatPaise,
  formatPayment,
  type RawOrderDetail,
  type OrderDetail,
} from "../../../../lib/order-detail";
import { BRAND } from "../../../../theme";
import { useRequireSession } from "../../../../lib/use-require-session";
import { OrderStatusStepper } from "../../../../components/OrderStatusStepper";
import { OrderStatusPill } from "../../../../components/OrderStatusPill";
import { OrderItemsList } from "../../../../components/OrderItemsList";
import { CourierCard } from "../../../../components/CourierCard";
import { OrderTrackingMap } from "../../../../components/OrderTrackingMap";
import { showTrackingMap } from "../../../../lib/tracking";

type PartnerLocation = {
  current_lat: number | null;
  current_lng: number | null;
  last_ping_at: string | null;
};

// cancelled/rejected keep their exact early-return special case — they
// never map onto a TIMELINE_STEP_INDEX entry (see lib/order-status.ts).
function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <View style={styles.bannerError}>
        <Text style={styles.bannerErrorText}>Order cancelled</Text>
      </View>
    );
  }
  if (status === "rejected") {
    return (
      <View style={styles.bannerError}>
        <Text style={styles.bannerErrorText}>Restaurant rejected your order — payment refunded</Text>
      </View>
    );
  }

  return <OrderStatusStepper currentIndex={TIMELINE_STEP_INDEX[status]} />;
}

function TotalsRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.totalsRow}>
      <Text style={bold ? styles.totalLabelBold : styles.mutedText}>{label}</Text>
      <Text style={bold ? styles.totalLabelBold : styles.valueText}>{value}</Text>
    </View>
  );
}

function TimeRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.totalsRow}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.valueText}>{new Date(value).toLocaleString()}</Text>
    </View>
  );
}

export default function OrderDetailScreen() {
  useRequireSession("/login/customer");
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [sawPickedUp, setSawPickedUp] = useState(false);

  const postComplete = useCallback(async (): Promise<number> => {
    try {
      await apiFetch(`/api/customer/orders/${id}/complete-delivery`, { method: "POST" });
      return 200;
    } catch (thrown) {
      return thrown instanceof ApiError ? thrown.status : 0;
    }
  }, [id]);

  const loadSeq = useRef(0);

  // 3-second poll while this screen is focused, matching the web order
  // detail page — stops polling once the order reaches a terminal status,
  // and stops entirely (interval cleared) when the screen loses focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      async function load() {
        const seq = ++loadSeq.current;
        try {
          const { data, error: fetchError } = await supabase
            .from("orders")
            .select(ORDER_DETAIL_SELECT)
            .eq("id", id)
            .single();
          if (cancelled || seq !== loadSeq.current) return;
          if (fetchError || !data) {
            setError(fetchError?.message ?? "Failed to load order");
            return;
          }
          const next = normalizeOrderDetail(data as unknown as RawOrderDetail);
          setOrder(next);
          if (next.status === "picked_up") setSawPickedUp(true);
          setError(null);

          if (isTerminalStatus(next.status) && interval) {
            clearInterval(interval);
            interval = null;
          }

          if (next.deliveryPartnerId && SHOW_LOCATION_FOR_STATUS.includes(next.status)) {
            const { data: loc } = await supabase
              .from("delivery_partners")
              .select("current_lat, current_lng, last_ping_at")
              .eq("user_id", next.deliveryPartnerId)
              .single();
            if (!cancelled && seq === loadSeq.current) setPartnerLocation(loc ?? null);
          } else if (!cancelled && seq === loadSeq.current) {
            setPartnerLocation(null);
          }
        } catch (thrown) {
          if (!cancelled && seq === loadSeq.current) setError(thrown instanceof Error ? thrown.message : "Failed to load order");
        }
      }

      load();
      interval = setInterval(load, 3000);
      return () => {
        cancelled = true;
        if (interval) clearInterval(interval);
      };
    }, [id])
  );

  if (!order) {
    return (
      <View style={styles.container}>
        {error ? (
          <Text style={styles.errorText}>Couldn&apos;t load order: {error}</Text>
        ) : (
          <Text style={styles.mutedText}>Loading order…</Text>
        )}
      </View>
    );
  }

  const showAnimation =
    !dismissed &&
    (order.status === "picked_up" || (sawPickedUp && order.status === "delivered") || celebrating);
  const courierAssigned =
    order.deliveryPartnerId != null && (order.status === "assigned" || order.status === "picked_up");
  const phoneIsDialable = order.recipientPhone.startsWith("+");

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <DeliveryAnimation
        visible={showAnimation}
        orderId={order.id}
        post={postComplete}
        onDelivered={() => setCelebrating(true)}
        onClose={() => setDismissed(true)}
      />
      {error && <Text style={styles.errorText}>Couldn&apos;t refresh order: {error}</Text>}
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Order #{order.id.slice(0, 8)}</Text>
        <OrderStatusPill status={order.status} />
      </View>
      <Text style={styles.mutedText}>
        {order.storeName} · {new Date(order.placedAt).toLocaleString()}
      </Text>

      {order.payment?.status === "failed" ? (
        <Text style={styles.errorText}>
          Payment failed. Your order was not placed — please try checking out again.
        </Text>
      ) : (
        <>
          <Text style={styles.etaText}>{STATUS_MESSAGE[order.status]}</Text>

          <View style={styles.section}>
            <OrderTimeline status={order.status} />
          </View>

          {courierAssigned && <CourierCard name={null} />}

          {showTrackingMap(order.status) && (
            <OrderTrackingMap
              status={order.status}
              store={order.storePoint}
              destination={order.deliveryPoint}
              partnerLocation={partnerLocation}
            />
          )}
        </>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Deliver to</Text>
        <Text style={styles.valueText}>{order.recipientName}</Text>
        <Text style={styles.mutedText}>{order.recipientEmail}</Text>
        {phoneIsDialable ? (
          <Pressable onPress={() => Linking.openURL(`tel:${order.recipientPhone}`).catch(() => {})}>
            <Text style={styles.linkText}>{order.recipientPhone}</Text>
          </Pressable>
        ) : (
          <Text style={styles.mutedText}>{order.recipientPhone}</Text>
        )}
        {order.address ? (
          <View style={styles.addressBlock}>
            {order.address.label && <Text style={styles.valueText}>{order.address.label}</Text>}
            {order.address.lines.map((line, index) => (
              <Text key={`${index}-${line}`} style={styles.mutedText}>
                {line}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.mutedText}>No delivery address on file</Text>
        )}
        {order.deliveryNote && <Text style={styles.mutedText}>Note: {order.deliveryNote}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Items</Text>
        {order.items.length === 0 ? (
          <Text style={styles.mutedText}>No items</Text>
        ) : (
          <OrderItemsList items={order.items} />
        )}
      </View>

      <View style={styles.section}>
        <TotalsRow label="Subtotal" value={formatPaise(Math.round(order.subtotal * 100))} />
        <TotalsRow label="Delivery fee" value={formatPaise(Math.round(order.deliveryFee * 100))} />
        <TotalsRow label="Total" value={formatPaise(Math.round(order.total * 100))} bold />
        <TotalsRow label="Payment" value={formatPayment(order.payment)} />
      </View>

      <View style={styles.section}>
        <TimeRow label="Placed" value={order.placedAt} />
        <TimeRow label="Accepted" value={order.acceptedAt} />
        <TimeRow label="Picked up" value={order.pickedUpAt} />
        <TimeRow label="Delivered" value={order.deliveredAt} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: BRAND.colors.background },
  container: { padding: 16, gap: 16, backgroundColor: BRAND.colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 22, color: BRAND.colors.ink, flexShrink: 1 },
  sectionTitle: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 16, color: BRAND.colors.ink, marginBottom: 4 },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted },
  valueText: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
  linkText: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.primaryTextSafe },
  errorText: { fontFamily: BRAND.fonts.body, color: "#dc2626" },
  addressBlock: { marginTop: 4, gap: 2 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  totalLabelBold: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.ink },
  section: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 16,
    gap: 4,
  },
  etaText: { fontFamily: BRAND.fonts.heading, fontSize: 20, color: BRAND.colors.ink },
  bannerError: { borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", borderRadius: BRAND.radius, padding: 12 },
  bannerErrorText: { fontFamily: BRAND.fonts.bodyMedium, color: "#b91c1c" },
});
