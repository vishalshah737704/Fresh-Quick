import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
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
  sendChat,
  type ConversationSummary,
} from "../lib/zippy";

// Local view of a turn: isError marks a failure notice shown in the sheet,
// which must never be sent back to the server as conversation history.
type LocalMessage = { role: "user" | "assistant"; content: string; isError?: boolean };

// Sits above the customer tab bar (~49 + bottom inset) and the full-width
// floating cart pill (bottom 12, ~46 tall) so it overlaps neither.
const FAB_BOTTOM_OFFSET = 124;

const headerButton = { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" } as const;

export function ZippyFab() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<FlatList<LocalMessage>>(null);
  // Every action that starts async work bumps this; a result whose token is no
  // longer current (New chat, account switch, a newer action) is dropped.
  const requestToken = useRef(0);
  // undefined until the first session resolves, so that first resolution
  // does not count as an account change.
  const previousUserId = useRef<string | null | undefined>(undefined);

  const invalidatePending = useCallback(() => {
    requestToken.current += 1;
    setBusy(false);
    setLoadingList(false);
    setNotice(null);
    return requestToken.current;
  }, []);

  const reset = useCallback(() => {
    invalidatePending();
    setMessages([]);
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
    setMessages([...messages, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const result = await sendChat({ message: question, conversationId, history });
      if (token !== requestToken.current) return;
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
      if (result.conversationId) setConversationId(result.conversationId);
    } catch (error) {
      if (token !== requestToken.current) return;
      const message = error instanceof ZippyError ? error.message : ZIPPY_ERROR_MESSAGE;
      setMessages((current) => [...current, { role: "assistant", content: message, isError: true }]);
    } finally {
      if (token === requestToken.current) setBusy(false);
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

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
          style={{ flex: 1, backgroundColor: BRAND.colors.background, paddingTop: insets.top }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: BRAND.colors.primaryTextSafe, padding: 12, gap: 12 }}>
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
              keyExtractor={(_, i) => String(i)}
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
                <View style={bubble(item.role)}>
                  <Text style={{ color: item.role === "user" ? "#fff" : BRAND.colors.ink, fontFamily: BRAND.fonts.body }}>{item.content}</Text>
                </View>
              )}
              ListFooterComponent={busy ? <ActivityIndicator color={BRAND.colors.primary} style={{ alignSelf: "flex-start", margin: 8 }} /> : null}
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
