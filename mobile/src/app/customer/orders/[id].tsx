import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import {
  ORDER_DETAIL_STATUS_LABEL,
  TIMELINE_STEPS,
  TIMELINE_STEP_INDEX,
  SHOW_LOCATION_FOR_STATUS,
  TERMINAL_STATUSES,
  type OrderStatus,
} from "../../../../lib/order-status";
import { BRAND } from "../../../../theme";
import { useRequireSession } from "../../../../lib/use-require-session";

type OrderView = {
  id: string;
  status: OrderStatus;
  total: number;
  delivery_partner_id: string | null;
};

type PaymentView = {
  status: "pending" | "success" | "failed" | "refunded";
  method: string;
};

type PartnerLocation = {
  current_lat: number | null;
  current_lng: number | null;
  last_ping_at: string | null;
};

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

  const currentIndex = TIMELINE_STEP_INDEX[status];

  return (
    <View style={styles.timelineRow}>
      {TIMELINE_STEPS.map((label, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <View key={label} style={styles.timelineStep}>
            <View style={[styles.timelineDot, (complete || active) && styles.timelineDotActive]}>
              <Text style={[styles.timelineDotText, (complete || active) && styles.timelineDotTextActive]}>
                {complete ? "✓" : index + 1}
              </Text>
            </View>
            <Text style={[styles.timelineLabel, active && styles.timelineLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function OrderDetailScreen() {
  useRequireSession("/login/customer");
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 3-second poll while this screen is focused, matching the web order
  // detail page — stops polling once the order reaches a terminal status,
  // and stops entirely (interval cleared) when the screen loses focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let interval: ReturnType<typeof setInterval> | null = null;

      async function load() {
        const [{ data: o, error: oErr }, { data: p, error: pErr }] = await Promise.all([
          supabase
            .from("orders")
            .select("id, status, total, delivery_partner_id")
            .eq("id", id)
            .single(),
          supabase.from("payments").select("status, method").eq("order_id", id).single(),
        ]);
        if (cancelled) return;
        if (oErr || pErr) {
          setError((oErr ?? pErr)?.message ?? "Failed to load order");
          return;
        }
        setOrder(o as OrderView);
        setPayment(p as PaymentView);

        if (TERMINAL_STATUSES.includes((o as OrderView).status)) {
          if (interval) clearInterval(interval);
        }

        if ((o as OrderView).delivery_partner_id && SHOW_LOCATION_FOR_STATUS.includes((o as OrderView).status)) {
          const { data: loc } = await supabase
            .from("delivery_partners")
            .select("current_lat, current_lng, last_ping_at")
            .eq("user_id", (o as OrderView).delivery_partner_id as string)
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
    }, [id])
  );

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Couldn&apos;t load order: {error}</Text>
      </View>
    );
  }

  if (!order || !payment) {
    return (
      <View style={styles.container}>
        <Text style={styles.mutedText}>Loading order…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Order #{order.id.slice(0, 8)}</Text>
      {payment.status === "failed" ? (
        <Text style={styles.errorText}>
          Payment failed. Your order was not placed — please try checking out again.
        </Text>
      ) : (
        <>
          <View style={styles.section}>
            <OrderTimeline status={order.status} />
            <Text style={styles.statusLabel}>{ORDER_DETAIL_STATUS_LABEL[order.status]}</Text>
          </View>

          {partnerLocation?.current_lat != null && partnerLocation?.current_lng != null && (
            <View style={styles.locationBox}>
              <Text style={{ fontSize: 24 }}>📍</Text>
              <Text style={styles.locationCoords}>
                {partnerLocation.current_lat.toFixed(4)}, {partnerLocation.current_lng.toFixed(4)}
              </Text>
              {partnerLocation.last_ping_at && (
                <Text style={styles.mutedText}>
                  Updated {new Date(partnerLocation.last_ping_at).toLocaleTimeString()}
                </Text>
              )}
              <Text style={styles.mutedTextSmall}>Live map coming soon — showing raw coordinates for now.</Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.mutedText}>Total: ₹{order.total.toFixed(2)}</Text>
            <Text style={styles.mutedText}>
              Payment: {payment.status} ({payment.method})
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: BRAND.colors.background },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 22, color: BRAND.colors.ink },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted },
  mutedTextSmall: { fontFamily: BRAND.fonts.body, fontSize: 11, color: BRAND.colors.inkMuted },
  errorText: { fontFamily: BRAND.fonts.body, color: "#dc2626" },
  section: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 16,
    gap: 4,
  },
  statusLabel: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted, marginTop: 8 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start" },
  timelineStep: { flex: 1, alignItems: "center", gap: 4 },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.colors.inkMuted + "22",
  },
  timelineDotActive: { backgroundColor: BRAND.colors.primary },
  timelineDotText: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 12, color: BRAND.colors.inkMuted },
  timelineDotTextActive: { color: BRAND.colors.surface },
  timelineLabel: { fontFamily: BRAND.fonts.body, fontSize: 11, color: BRAND.colors.inkMuted },
  timelineLabelActive: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.ink },
  bannerError: { borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", borderRadius: BRAND.radius, padding: 12 },
  bannerErrorText: { fontFamily: BRAND.fonts.bodyMedium, color: "#b91c1c" },
  locationBox: {
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: BRAND.colors.inkMuted + "40",
    backgroundColor: BRAND.colors.inkMuted + "0d",
    borderRadius: BRAND.radius,
    paddingVertical: 24,
  },
  locationCoords: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
});
