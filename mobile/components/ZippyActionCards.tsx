import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { BRAND } from "../theme";
import type { ActionCard, CartApi } from "../lib/action-types";
import { executeAction } from "../lib/action-exec";

type CardState = { status: "idle" } | { status: "done" | "failed"; message: string } | { status: "dismissed" };

const button = { minHeight: 44, paddingHorizontal: 18, borderRadius: BRAND.radiusPill, alignItems: "center", justifyContent: "center" } as const;

// One tap runs one card, once.
export function ZippyActionCards({ cards, cart, onNavigate }: { cards: ActionCard[]; cart: CartApi; onNavigate?: () => void }) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, CardState>>({});
  const executed = useRef<Set<string>>(new Set());

  const confirm = (card: ActionCard) => {
    if (executed.current.has(card.id) || (states[card.id] && states[card.id].status !== "idle")) return;
    executed.current.add(card.id);
    try {
      const result = executeAction(card, cart);
      if (card.kind === "go_to_checkout") {
        if (!result.ok) {
          executed.current.delete(card.id);
          setStates((current) => ({ ...current, [card.id]: { status: "failed", message: result.message } }));
          return;
        }
        setStates((current) => ({ ...current, [card.id]: { status: "done", message: result.message } }));
        onNavigate?.();
        router.push("/customer/checkout");
        return;
      }
      setStates((current) => ({ ...current, [card.id]: { status: result.ok ? "done" : "failed", message: result.message } }));
    } catch {
      setStates((current) => ({ ...current, [card.id]: { status: "failed", message: "Something went wrong, try again." } }));
    }
  };
  const dismiss = (card: ActionCard) => setStates((current) => ({ ...current, [card.id]: { status: "dismissed" } }));

  return (
    <View style={{ alignSelf: "flex-start", maxWidth: "85%", marginBottom: 8, gap: 8 }}>
      {cards.map((card) => {
        const state = states[card.id] ?? { status: "idle" as const };
        if (state.status === "dismissed") return null;
        return (
          <View key={card.id} style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: BRAND.colors.primaryTextSafe, padding: 12 }}>
            <Text style={{ color: BRAND.colors.ink, fontFamily: BRAND.fonts.bodySemiBold }}>{card.title}</Text>
            <Text style={{ color: BRAND.colors.ink, fontFamily: BRAND.fonts.body, marginTop: 4 }}>{card.description}</Text>
            {state.status === "idle" ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${card.kind === "go_to_checkout" ? "Go to checkout" : "Confirm"}: ${card.title}`} onPress={() => confirm(card)} style={[button, { backgroundColor: BRAND.colors.primaryTextSafe }]}>
                  <Text style={{ color: "#fff", fontFamily: BRAND.fonts.bodySemiBold }}>{card.kind === "go_to_checkout" ? "Go to checkout" : "Confirm"}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss: ${card.title}`} onPress={() => dismiss(card)} style={[button, { borderWidth: 1, borderColor: BRAND.colors.inkMuted }]}>
                  <Text style={{ color: BRAND.colors.ink, fontFamily: BRAND.fonts.bodyMedium }}>Dismiss</Text>
                </Pressable>
              </View>
            ) : (
              <Text accessibilityRole="alert" style={{ marginTop: 8, color: state.status === "done" ? "#15803d" : "#b91c1c", fontFamily: BRAND.fonts.bodyMedium }}>
                {state.message}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
