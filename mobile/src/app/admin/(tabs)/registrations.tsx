import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { apiFetch, ApiError } from "../../../../lib/api";
import { BRAND } from "../../../../theme";
import { useRequireSession } from "../../../../lib/use-require-session";
import type { RegistrationRow } from "../../../../lib/registration-admin";
import { REJECTION_REASON_MAX, cleanRejectionReason } from "../../../../lib/registration-model";
import { notifyAdminPendingChanged } from "../../../../lib/admin-pending";

type Segment = "pending" | "history";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "");

// Mirrors app/admin/(portal)/registrations/page.tsx on the web, including its fixes: a loading state before
// the empty text, stale responses dropped, one decision at a time, tapping the active segment does nothing.
export default function AdminRegistrationsScreen() {
  useRequireSession("/login/admin");
  const [segment, setSegment] = useState<Segment>("pending");
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<RegistrationRow | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const busyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const mine = ++requestRef.current;
    try {
      const body = await apiFetch<{ requests: RegistrationRow[] }>(`/api/admin/registrations?view=${segment}`);
      if (mine !== requestRef.current) return;
      setRows(body.requests);
      setError(null);
    } catch (err) {
      if (mine !== requestRef.current) return;
      setError(err instanceof ApiError && err.message ? err.message : "Failed to load registrations");
    } finally {
      if (mine === requestRef.current) {
        setLoaded(true);
        setRefreshing(false);
      }
    }
  }, [segment]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 30000);
      return () => clearInterval(timer);
    }, [load])
  );

  // POSTs /api/admin/registrations/[id]/approve or /reject. Returns an error text, or null on success.
  async function decide(row: RegistrationRow, kind: "approve" | "reject", reasonText?: string): Promise<string | null> {
    if (busyRef.current) return "Another decision is still being saved.";
    busyRef.current = row.id;
    setBusyId(row.id);
    try {
      await apiFetch(`/api/admin/registrations/${row.id}/${kind}`, {
        method: "POST",
        body: kind === "reject" ? { reason: reasonText } : undefined,
      });
      notifyAdminPendingChanged();
      return null;
    } catch (err) {
      return err instanceof ApiError && err.message ? err.message : `Failed to ${kind}`;
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }

  async function approve(row: RegistrationRow) {
    setError(null);
    const failure = await decide(row, "approve");
    if (failure) setError(failure);
    await load();
  }

  function openReject(row: RegistrationRow) {
    setRejecting(row);
    setReason("");
    setReasonError(null);
  }

  async function submitReject() {
    if (!rejecting) return;
    const cleaned = cleanRejectionReason(reason);
    if (!cleaned.ok) {
      setReasonError(cleaned.error);
      return;
    }
    const failure = await decide(rejecting, "reject", cleaned.value);
    if (failure) {
      setReasonError(failure);
      await load();
      return;
    }
    setRejecting(null);
    await load();
  }

  return (
    <View style={styles.flex}>
      <View style={styles.headerBlock}>
        <Text style={styles.heading}>Registrations</Text>
        <View style={styles.segmentRow}>
          {(["pending", "history"] as const).map((tab) => (
            <Pressable
              key={tab}
              accessibilityRole="button"
              onPress={() => {
                if (tab === segment) return;
                setRows([]);
                setLoaded(false);
                setSegment(tab);
              }}
              style={[styles.segment, segment === tab && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, segment === tab && styles.segmentTextActive]}>
                {tab === "pending" ? "Pending" : "History"}
              </Text>
            </Pressable>
          ))}
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {!loaded ? (
          <Text style={styles.muted}>Loading registrations...</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.muted}>
            {segment === "pending" ? "No registrations are waiting for approval." : "No decisions yet."}
          </Text>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.card}>
              <Text style={styles.name}>{row.fullName || "(no name)"}</Text>
              <Text style={styles.line}>{row.email}</Text>
              {row.phone ? <Text style={styles.line}>{row.phone}</Text> : null}
              <Text style={styles.line}>{[row.line1, row.city, row.pincode].filter(Boolean).join(", ")}</Text>
              <Text style={styles.small}>Registered {when(row.createdAt)}</Text>
              {segment === "history" ? (
                <>
                  <Text style={styles.line}>
                    {row.status === "approved" ? "Approved" : "Rejected"} {when(row.reviewedAt)}
                  </Text>
                  {row.reason ? <Text style={styles.line}>Reason: {row.reason}</Text> : null}
                </>
              ) : (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.approve, busyId !== null && styles.disabled]}
                    disabled={busyId !== null}
                    onPress={() => void approve(row)}
                  >
                    {busyId === row.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveText}>Approve</Text>}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.reject, busyId !== null && styles.disabled]}
                    disabled={busyId !== null}
                    onPress={() => openReject(row)}
                  >
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={rejecting !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setRejecting(null)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Reject {rejecting?.fullName || rejecting?.email}</Text>
            <Text style={styles.small}>The reason is emailed to the customer (up to {REJECTION_REASON_MAX} characters).</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason"
              placeholderTextColor={BRAND.colors.inkMuted}
              multiline
              value={reason}
              onChangeText={(text) => {
                setReason(text);
                setReasonError(null);
              }}
            />
            {reasonError && <Text style={styles.error}>{reasonError}</Text>}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" style={styles.cancel} onPress={() => setRejecting(null)} disabled={busyId !== null}>
                <Text style={styles.rejectText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={[styles.rejectFill, busyId !== null && styles.disabled]}
                onPress={() => void submitReject()}
                disabled={busyId !== null}
              >
                {busyId !== null ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveText}>Reject</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BRAND.colors.background },
  headerBlock: { padding: 16, gap: 10 },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: { borderRadius: 999, borderWidth: 1, borderColor: BRAND.colors.inkMuted, paddingHorizontal: 16, paddingVertical: 6 },
  segmentActive: { backgroundColor: BRAND.colors.primaryTextSafe, borderColor: BRAND.colors.primaryTextSafe },
  segmentText: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
  segmentTextActive: { color: "#fff" },
  error: { color: BRAND.colors.dangerTextSafe, fontFamily: BRAND.fonts.body },
  list: { padding: 16, paddingTop: 0, gap: 12 },
  muted: { color: BRAND.colors.inkMuted, fontFamily: BRAND.fonts.body },
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 14, gap: 4 },
  name: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 16, color: BRAND.colors.ink },
  line: { fontFamily: BRAND.fonts.body, color: BRAND.colors.ink },
  small: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted, fontSize: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8, justifyContent: "flex-end" },
  approve: { backgroundColor: BRAND.colors.accentTextSafe, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, minWidth: 96, alignItems: "center" },
  approveText: { color: "#fff", fontFamily: BRAND.fonts.bodySemiBold },
  reject: { borderWidth: 1, borderColor: BRAND.colors.dangerTextSafe, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  rejectText: { color: BRAND.colors.dangerTextSafe, fontFamily: BRAND.fonts.bodySemiBold },
  rejectFill: { backgroundColor: BRAND.colors.dangerTextSafe, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, minWidth: 96, alignItems: "center" },
  cancel: { borderWidth: 1, borderColor: BRAND.colors.inkMuted, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  disabled: { opacity: 0.5 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: BRAND.colors.surface, borderRadius: BRAND.radius, padding: 20, gap: 10 },
  dialogTitle: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 18, color: BRAND.colors.ink },
  reasonInput: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted,
    borderRadius: BRAND.radius,
    padding: 10,
    minHeight: 90,
    textAlignVertical: "top",
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.ink,
  },
});
