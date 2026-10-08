import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Share, StyleSheet } from "react-native";
import { apiFetch, ApiError } from "../../../lib/api";
import { useRequireSession } from "../../../lib/use-require-session";
import { formatPaise, ledgerKindLabel, type WalletEntry } from "../../../lib/coupon-model";
import { BRAND } from "../../../theme";

type WalletData = {
  balancePaise: number;
  referralCode: string;
  referralRewardPaise: number;
  referralMaxRewards: number;
  referredCount: number;
  creditedCount: number;
  entries: WalletEntry[];
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export default function WalletScreen() {
  useRequireSession("/login/customer");
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<WalletData>("/api/customer/wallet")
      .then((data) => {
        if (!cancelled) setWallet(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load your wallet");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (!wallet) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND.colors.primary} />
      </View>
    );
  }

  const reward = formatPaise(wallet.referralRewardPaise);

  async function shareCode() {
    if (!wallet) return;
    try {
      await Share.share({
        message: `Join me on Fresh & Quick! Use my referral code ${wallet.referralCode} when you sign up and we each get ${reward} after your first delivered order.`,
      });
    } catch {
      // Share sheet dismissed or unavailable: nothing to do.
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Wallet</Text>

      <View style={styles.card}>
        <Text style={styles.mutedText}>Wallet credit</Text>
        <Text style={styles.balance}>{formatPaise(wallet.balancePaise)}</Text>
        <Text style={styles.footnote}>Use it at checkout to pay for part or all of an order.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Refer a friend</Text>
        <Text style={styles.mutedText}>
          You and a friend each get {reward} after their first delivered order of{" "}
          {formatPaise(10000)} or more; up to {wallet.referralMaxRewards} rewards.
        </Text>
        <View style={styles.codeRow}>
          <Text style={styles.code} selectable>
            {wallet.referralCode}
          </Text>
          <Pressable style={styles.shareButton} onPress={() => void shareCode()} accessibilityRole="button">
            <Text style={styles.shareButtonText}>Share</Text>
          </Pressable>
        </View>
        <Text style={styles.footnote}>
          Friends joined: {wallet.referredCount} · Rewards earned: {wallet.creditedCount}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>History</Text>
        {wallet.entries.length === 0 ? (
          <Text style={styles.mutedText}>No wallet activity yet.</Text>
        ) : (
          wallet.entries.map((e) => (
            <View key={e.id} style={styles.entryRow}>
              <View style={styles.entryText}>
                <Text style={styles.entryLabel}>{ledgerKindLabel(e.kind)}</Text>
                <Text style={styles.footnote}>
                  {formatDate(e.createdAt)}
                  {e.note ? ` · ${e.note}` : ""}
                </Text>
              </View>
              <Text style={[styles.entryAmount, e.amountPaise < 0 && styles.entryAmountNegative]}>
                {e.amountPaise < 0 ? "-" : "+"}
                {formatPaise(Math.abs(e.amountPaise))}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, backgroundColor: BRAND.colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BRAND.colors.background, padding: 16 },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  sectionTitle: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 15, color: BRAND.colors.ink },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted },
  errorText: { fontFamily: BRAND.fonts.body, color: "#dc2626" },
  card: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 16,
    gap: 8,
  },
  balance: { fontFamily: BRAND.fonts.heading, fontSize: 32, color: BRAND.colors.primaryTextSafe },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  code: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 20, letterSpacing: 1, color: BRAND.colors.ink },
  shareButton: {
    backgroundColor: BRAND.colors.primaryTextSafe,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  shareButtonText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.surface },
  footnote: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
  entryRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  entryText: { flex: 1, gap: 2 },
  entryLabel: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
  entryAmount: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.primaryTextSafe },
  entryAmountNegative: { color: BRAND.colors.ink },
});
