import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "../theme";
import { supabase } from "../lib/supabase";
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  SUGGESTED_QUESTIONS,
  ZIPPY_ERROR_MESSAGE,
  ZIPPY_NAME,
  ZIPPY_WELCOME,
} from "../lib/zippy-constants";
import {
  ZippyError,
  listConversations,
  loadConversation,
  streamChat,
  type ConversationSummary,
} from "../lib/zippy";
import { getChatLocation } from "../lib/zippy-location";
import { useDeliveryLocation } from "../lib/location-store";
import { useCart } from "../lib/cart-store";
import { snapshotCart } from "../lib/client-cart";
import type { ActionCard, CardState } from "../lib/action-types";
import { ZippyActionCards } from "./ZippyActionCards";

// Local view of a turn: isError marks a failure notice shown in the sheet,
// which must never be sent back to the server as conversation history.
// id is a stable list key so action cards keep their state as messages are appended.
type LocalMessage = { role: "user" | "assistant"; content: string; isError?: boolean; actions?: ActionCard[]; id?: number };

// Sits above the customer tab bar (~49 + bottom inset) and the full-width
// floating cart pill (bottom 12, ~46 tall) so it overlaps neither.
const FAB_BOTTOM_OFFSET = 124;

const headerButton = { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" } as const;

export function ZippyFab() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // Android only: lift the chat box above a DOCKED keyboard. A floating keyboard (the emulator's
  // hardware-keyboard toolbar, split or floating Gboard) does not take up screen space, and letting
  // KeyboardAvoidingView react to it made the layout jump between two heights, which looked like flicker.
  const [dockedKeyboardHeight, setDockedKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      const { screenY, height } = event.endCoordinates;
      // Docked = the keyboard reaches (almost) the bottom edge. The margin covers the status and
      // navigation bars; the floating variants end well above that (about 40% to 65% of the screen).
      const docked = screenY + height >= Dimensions.get("screen").height * 0.85;
      setDockedKeyboardHeight(docked ? height : 0);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setDockedKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // True once the first streamed text is on screen (the thinking indicator then hides).
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cart = useCart();
  const { location: savedLocation } = useDeliveryLocation();
  const nextId = useRef(1);
  const streamIdRef = useRef<number | null>(null);
  const listRef = useRef<FlatList<LocalMessage>>(null);
  // Every action that starts async work bumps this; a result whose token is no
  // longer current (New chat, account switch, a newer action) is dropped.
  const requestToken = useRef(0);
  // Per-card state is kept here, not in ZippyActionCards, so closing the modal does not forget which cards were already confirmed.
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const executedCards = useRef<Set<string>>(new Set());
  // undefined until the first session resolves, so that first resolution
  // does not count as an account change.
  const previousUserId = useRef<string | null | undefined>(undefined);

  const invalidatePending = useCallback(() => {
    requestToken.current += 1;
    // An aborted reply is partial and never saved, so drop it instead of leaving it looking complete.
    const partialId = streamIdRef.current;
    streamIdRef.current = null;
    if (abortRef.current && partialId !== null) setMessages((current) => current.filter((m) => m.id !== partialId));
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStreaming(false);
    setLoadingList(false);
    setNotice(null);
    return requestToken.current;
  }, []);

  // Unmount: drop the token (no setState after) and abort the request, like web.
  useEffect(() => () => {
    requestToken.current += 1;
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    invalidatePending();
    setMessages([]);
    setCardStates({});
    executedCards.current = new Set();
    setConversations([]);
    setConversationId(null);
    setShowHistory(false);
    setInput("");
  }, [invalidatePending]);

  useEffect(() => {
    const applyUser = (next: string | null) => {
      if (previousUserId.current !== undefined && previousUserId.current !== next) reset();
      previousUserId.current = next;
      setUserId(next);
    };
    supabase.auth.getSession().then(({ data }) => applyUser(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [reset]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages
      .filter((m) => !m.isError && m.content.trim() !== "")
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-MAX_HISTORY_MESSAGES);
    const token = invalidatePending();
    setShowHistory(false);
    setMessages([
      ...messages.map((m) => (m.id === undefined ? { ...m, id: nextId.current++ } : m)),
      { role: "user", content: question, id: nextId.current++ },
    ]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let streamId: number | null = null;
    // Snapshot what the user saw when asking, before the permission prompt can take seconds; confirm re-checks the live cart (CART_CHANGED).
    const cartSnapshot = snapshotCart({ ...cart, orderNote: cart.orderNote });
    try {
      const location = await getChatLocation(question, savedLocation);
      if (token !== requestToken.current) return;
      const result = await streamChat({
        message: question,
        conversationId,
        history,
        location,
        cart: cartSnapshot,
        signal: controller.signal,
        onDelta: (delta) => {
          if (token !== requestToken.current) return;
          if (streamId === null) {
            const id = nextId.current++;
            streamId = id;
            streamIdRef.current = id;
            setStreaming(true);
            setMessages((current) => [...current, { role: "assistant", content: delta, id }]);
          } else {
            const id = streamId;
            setMessages((current) => current.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)));
          }
        },
        onReset: () => {
          if (token !== requestToken.current) return;
          const id = streamId;
          streamId = null;
          streamIdRef.current = null;
          setStreaming(false);
          if (id !== null) setMessages((current) => current.filter((m) => m.id !== id));
        },
      });
      if (token !== requestToken.current) return;
      const finalId = streamId;
      if (finalId !== null) {
        setMessages((current) => current.map((m) => (m.id === finalId ? { ...m, content: result.reply, actions: result.actions } : m)));
      } else {
        setMessages((current) => [...current, { role: "assistant", content: result.reply, actions: result.actions, id: nextId.current++ }]);
      }
      if (result.conversationId) setConversationId(result.conversationId);
    } catch (error) {
      if (token !== requestToken.current) return;
      const message = error instanceof ZippyError ? error.message : ZIPPY_ERROR_MESSAGE;
      const failedId = streamId;
      if (failedId !== null) {
        setMessages((current) => current.map((m) => (m.id === failedId ? { ...m, content: message, isError: true } : m)));
      } else {
        setMessages((current) => [...current, { role: "assistant", content: message, isError: true, id: nextId.current++ }]);
      }
    } finally {
      if (token === requestToken.current) {
        setBusy(false);
        setStreaming(false);
        abortRef.current = null;
        streamIdRef.current = null;
      }
    }
  };

  const openHistory = async () => {
    const token = invalidatePending();
    setShowHistory(true);
    setConversations([]);
    setLoadingList(true);
    try {
      const list = await listConversations();
      if (token === requestToken.current) setConversations(list);
    } catch {
      if (token === requestToken.current) {
        setConversations([]);
        setNotice(ZIPPY_ERROR_MESSAGE);
      }
    } finally {
      if (token === requestToken.current) setLoadingList(false);
    }
  };

  const resume = async (id: string) => {
    const token = invalidatePending();
    try {
      const loaded = await loadConversation(id);
      if (token !== requestToken.current) return;
      setMessages(loaded);
      setConversationId(id);
      setShowHistory(false);
    } catch {
      // stay in History and say so; the notice clears on the next action
      if (token === requestToken.current) setNotice(ZIPPY_ERROR_MESSAGE);
    }
  };

  const bubble = (role: "user" | "assistant") => ({
    alignSelf: role === "user" ? ("flex-end" as const) : ("flex-start" as const),
    maxWidth: "85%" as const,
    backgroundColor: role === "user" ? BRAND.colors.ink : BRAND.colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${ZIPPY_NAME}`}
        onPress={() => setOpen(true)}
        style={{
          position: "absolute",
          right: 16,
          bottom: insets.bottom + FAB_BOTTOM_OFFSET,
          backgroundColor: BRAND.colors.primaryTextSafe,
          borderRadius: BRAND.radiusPill,
          paddingHorizontal: 18,
          paddingVertical: 12,
          elevation: 6,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        <Text style={{ color: "#fff", fontFamily: BRAND.fonts.bodySemiBold }}>⚡ {ZIPPY_NAME}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
          style={{ flex: 1, backgroundColor: BRAND.colors.background, paddingBottom: dockedKeyboardHeight }}
        >
          <StatusBar style="light" />
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: BRAND.colors.primaryTextSafe, padding: 12, paddingTop: insets.top + 12, gap: 12 }}>
            <Text style={{ flex: 1, color: "#fff", fontSize: 18, fontFamily: BRAND.fonts.heading }}>{ZIPPY_NAME}</Text>
            {userId && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showHistory ? "Back to chat" : "Chat history"}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                hitSlop={8}
                onPress={showHistory ? () => setShowHistory(false) : openHistory}
                style={[headerButton, { opacity: busy ? 0.4 : 1 }]}
              >
                <Text style={{ color: "#fff", fontFamily: BRAND.fonts.bodyMedium }}>{showHistory ? "Chat" : "History"}</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              hitSlop={8}
              onPress={reset}
              style={[headerButton, { opacity: busy ? 0.4 : 1 }]}
            >
              <Text style={{ color: "#fff", fontFamily: BRAND.fonts.bodyMedium }}>New chat</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${ZIPPY_NAME}`}
              hitSlop={8}
              onPress={() => setOpen(false)}
              style={headerButton}
            >
              <Text style={{ color: "#fff", fontSize: 24 }}>×</Text>
            </Pressable>
          </View>

          {showHistory ? (
            <FlatList
              data={conversations}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ padding: 12 }}
              ListHeaderComponent={notice ? <Text style={{ color: BRAND.colors.danger, marginBottom: 8 }}>{notice}</Text> : null}
              ListEmptyComponent={
                loadingList ? (
                  <Text style={{ color: BRAND.colors.inkMuted }}>Loading…</Text>
                ) : notice ? null : (
                  <Text style={{ color: BRAND.colors.inkMuted }}>No saved chats yet.</Text>
                )
              }
              renderItem={({ item }) => (
                <Pressable onPress={() => resume(item.id)} style={{ backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 12, marginBottom: 8 }}>
                  <Text style={{ color: BRAND.colors.ink, fontFamily: BRAND.fonts.body }}>{item.title}</Text>
                </Pressable>
              )}
            />
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m, i) => (m.id !== undefined ? `m${m.id}` : `i${i}`)}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              contentContainerStyle={{ padding: 12 }}
              ListHeaderComponent={
                <View>
                  <View style={bubble("assistant")}>
                    <Text style={{ color: BRAND.colors.ink, fontFamily: BRAND.fonts.body }}>{ZIPPY_WELCOME}</Text>
                  </View>
                  {messages.length === 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                      {SUGGESTED_QUESTIONS.map((q) => (
                        <Pressable key={q} onPress={() => send(q)} style={{ borderWidth: 1, borderColor: BRAND.colors.primaryTextSafe, borderRadius: BRAND.radiusPill, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: BRAND.colors.surface }}>
                          <Text style={{ color: BRAND.colors.primaryTextSafe, fontFamily: BRAND.fonts.bodyMedium }}>{q}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              }
              renderItem={({ item }) => (
                <View>
                  {(item.content.trim() !== "" || !item.actions?.length) && (
                    <View style={bubble(item.role)}>
                      <Text style={{ color: item.role === "user" ? "#fff" : BRAND.colors.ink, fontFamily: BRAND.fonts.body }}>{item.content}</Text>
                    </View>
                  )}
                  {item.role === "assistant" && item.actions && item.actions.length > 0 && <ZippyActionCards cards={item.actions} cart={cart} onNavigate={() => setOpen(false)} states={cardStates} setStates={setCardStates} executed={executedCards} />}
                </View>
              )}
              ListFooterComponent={busy && !streaming ? <ActivityIndicator color={BRAND.colors.primary} style={{ alignSelf: "flex-start", margin: 8 }} /> : null}
            />
          )}

          <View style={{ flexDirection: "row", gap: 8, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: BRAND.colors.surface }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              maxLength={MAX_MESSAGE_CHARS}
              placeholder={`${ZIPPY_NAME} a question…`}
              placeholderTextColor={BRAND.colors.inkMuted}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              style={{ flex: 1, borderWidth: 1, borderColor: BRAND.colors.inkMuted, borderRadius: BRAND.radiusPill, paddingHorizontal: 16, paddingVertical: 10, color: BRAND.colors.ink }}
            />
            <Pressable
              onPress={() => send(input)}
              disabled={busy || input.trim() === ""}
              style={{ backgroundColor: BRAND.colors.primaryTextSafe, borderRadius: BRAND.radiusPill, paddingHorizontal: 18, justifyContent: "center", opacity: busy || input.trim() === "" ? 0.5 : 1 }}
            >
              <Text style={{ color: "#fff", fontFamily: BRAND.fonts.bodySemiBold }}>Send</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
