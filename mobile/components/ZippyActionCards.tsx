import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { BRAND } from "../theme";
import type { ActionCard, CardState, CartApi } from "../lib/action-types";
import { executeAction } from "../lib/action-exec";

// A thrown confirm is the only retryable failure (state.retryable); a failed RESULT (e.g. "Your cart changed") stays final text.
const RETRY_MESSAGE = "Something went wrong, try again.";
const button = { minHeight: 44, paddingHorizontal: 18, borderRadius: BRAND.radiusPill, alignItems: "center", justifyContent: "center" } as const;

// One tap runs one card, once. `states` and `executed` live in the Fab (not here) so closing the chat modal, which unmounts this list, never makes a done card tappable again.
export function ZippyActionCards({
  cards,
  cart,
  onNavigate,
  states,
  setStates,
  executed,
}: {
  cards: ActionCard[];
  cart: CartApi;
  onNavigate?: () => void;
  states: Record<string, CardState>;
  setStates: Dispatch<SetStateAction<Record<string, CardState>>>;
  executed: MutableRefObject<Set<string>>;
}) {
  const router = useRouter();

  const confirm = (card: ActionCard, isRetry = false) => {
    // A retry is only offered on the thrown-error state (its id was released in the catch); a double tap stops here too.
    if (executed.current.has(card.id)) return;
    if (!isRetry && states[card.id] && states[card.id].status !== "idle") return;
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
        router.navigate("/customer/checkout");
        return;
      }
      setStates((current) => ({ ...current, [card.id]: { status: result.ok ? "done" : "failed", message: result.message } }));
    } catch {
      executed.current.delete(card.id);
      setStates((current) => ({ ...current, [card.id]: { status: "failed", message: RETRY_MESSAGE, retryable: true } }));
    }
  };
  const retry = (card: ActionCard) => confirm(card, true);
  const dismiss = (card: ActionCard) => setStates((current) => ({ ...current, [card.id]: { status: "dismissed" } }));

  return (
    <View style={{ alignSelf: "flex-start", maxWidth: "85%", marginBottom: 8, gap: 8 }}>
      {cards.map((card) => {
        const state = states[card.id] ?? { status: "idle" as const };
        if (state.status === "dismissed") return null;
        return (
          <View key={card.id} style={{ backgroundColor: BRAND.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: BRAND.colors.primaryTextSafe, padding: 12 }}>
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
              <View accessibilityRole="alert" style={{ marginTop: 8 }}>
                <Text style={{ color: state.status === "done" ? BRAND.colors.accentTextSafe : BRAND.colors.dangerTextSafe, fontFamily: BRAND.fonts.bodyMedium }}>{state.message}</Text>
                {state.status === "failed" && state.retryable === true && (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Try again: ${card.title}`} onPress={() => retry(card)} style={[button, { backgroundColor: BRAND.colors.primaryTextSafe, marginTop: 8, alignSelf: "flex-start" }]}>
                    <Text style={{ color: "#fff", fontFamily: BRAND.fonts.bodySemiBold }}>Try again</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
