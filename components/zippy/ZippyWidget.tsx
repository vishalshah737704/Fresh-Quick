"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  SUGGESTED_QUESTIONS,
  ZIPPY_ERROR_MESSAGE,
  ZIPPY_NAME,
  ZIPPY_WELCOME,
} from "@/lib/zippy/constants";
import {
  listConversations,
  loadConversation,
  streamChat,
  ZippyError,
  type ChatMessage,
  type ConversationSummary,
} from "@/lib/zippy/client-api";
import { resolveLocation } from "@/lib/zippy/client-location";
import { useOptionalCart } from "@/lib/cart-store";
import { snapshotCart } from "@/lib/zippy/client-cart";
import { ActionCards } from "./ActionCards";
import { ZIPPY_LOGIN_REQUIRED_MESSAGE } from "@/lib/registration-model";
import { isLoginRequiredError } from "@/lib/zippy-gate";
import type { ActionCard, CardState } from "@/lib/zippy/action-types";

type LocalMessage = ChatMessage & { isError?: boolean; actions?: ActionCard[]; id?: number };

export function ZippyWidget() {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const cart = useOptionalCart();
  const nextIdRef = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userIdRef = useRef<string | null | undefined>(undefined);
  // Bumped whenever the chat is reset or replaced; slower history/resume results for an older token are dropped.
  const tokenRef = useRef(0);
  // Per-card state is kept here, not in ActionCards, so closing the chat does not forget which cards were already confirmed.
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const executedCards = useRef<Set<string>>(new Set());

  const cancelStream = useCallback(() => {
    // abortRef is only set while a stream has not finished; an aborted reply is partial and never saved, so drop it.
    const inFlight = abortRef.current !== null;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    if (inFlight) {
      setMessages((current) => {
        const last = current[current.length - 1];
        return last && last.role === "assistant" && !last.isError ? current.slice(0, -1) : current;
      });
    }
  }, []);

  // Drops any in-flight stream so late deltas can never land in a fresh chat.
  const reset = useCallback(() => {
    tokenRef.current += 1;
    cancelStream();
    setMessages([]);
    setCardStates({});
    executedCards.current = new Set();
    setConversations([]);
    setConversationId(null);
    setShowHistory(false);
    setInput("");
  }, [cancelStream]);

  // A different account in the same tab must never see the previous chat.
  useEffect(() => {
    const apply = (next: string | null) => {
      const previous = userIdRef.current;
      userIdRef.current = next;
      // undefined = first resolution on mount; nothing to clear yet.
      if (previous !== undefined && previous !== next) reset();
      setUserId(next);
      if (next) setShowLoginPopup(false);
      setAuthResolved(true);
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [reset]);

  // Streaming updates the last message many times a second; only follow it while the reader is near the bottom.
  const lastCountRef = useRef(0);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const added = messages.length !== lastCountRef.current;
    lastCountRef.current = messages.length;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (added || nearBottom || !open || showHistory) el.scrollTo({ top: el.scrollHeight });
  }, [messages, open, showHistory]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;
      // Retained messages keep their action cards for display; only role/content is ever sent as history.
      const retained = messages
        .filter((m) => !m.isError && (m.content.trim() !== "" || (m.actions?.length ?? 0) > 0))
        .slice(-MAX_HISTORY_MESSAGES);
      const history: ChatMessage[] = retained
        .filter((m) => m.content.trim() !== "")
        .map(({ role, content }) => ({ role, content }));
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      tokenRef.current += 1;
      setShowHistory(false);
      setMessages([
        ...retained.map((m) => (m.id === undefined ? { ...m, id: nextIdRef.current++ } : m)),
        { role: "user", content: question, id: nextIdRef.current++ },
        { role: "assistant", content: "", id: nextIdRef.current++ },
      ]);
      setInput("");
      setBusy(true);
      try {
        const result = await streamChat({
          message: question,
          conversationId,
          history,
          signal: controller.signal,
          onDelta: (delta) => {
            if (controller.signal.aborted) return;
            setMessages((current) => {
              const last = current[current.length - 1];
              if (!last || last.role !== "assistant") return current;
              return [...current.slice(0, -1), { ...last, content: last.content + delta }];
            });
          },
          onReset: () => {
            if (controller.signal.aborted) return;
            setMessages((current) => {
              const last = current[current.length - 1];
              if (!last || last.role !== "assistant") return current;
              return [...current.slice(0, -1), { ...last, content: "" }];
            });
          },
          location: resolveLocation((key) => window.localStorage.getItem(key), window.location.pathname),
          cart: cart ? snapshotCart({ ...cart, orderNote: cart.orderNote }) : null,
        });
        if (controller.signal.aborted) return;
        setMessages((current) => {
          const copy = [...current];
          copy[copy.length - 1] = { ...copy[copy.length - 1], role: "assistant", content: result.reply, actions: result.actions };
          return copy;
        });
        if (result.conversationId) setConversationId(result.conversationId);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ZippyError && isLoginRequiredError(error.status, error.message, ZIPPY_LOGIN_REQUIRED_MESSAGE)) {
          setMessages([]);
          setOpen(false);
          setShowLoginPopup(true);
          return;
        }
        const message = error instanceof ZippyError ? error.message : ZIPPY_ERROR_MESSAGE;
        setMessages((current) => {
          const copy = [...current];
          copy[copy.length - 1] = { id: copy[copy.length - 1]?.id, role: "assistant", content: message, isError: true };
          return copy;
        });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setBusy(false);
        }
      }
    },
    [busy, cart, conversationId, messages]
  );

  const openHistory = async () => {
    cancelStream();
    const token = ++tokenRef.current;
    setShowHistory(true);
    setConversations([]);
    try {
      const list = await listConversations();
      if (token === tokenRef.current) setConversations(list);
    } catch {
      if (token === tokenRef.current) setConversations([]);
    }
  };

  const resume = async (id: string) => {
    cancelStream();
    const token = ++tokenRef.current;
    try {
      const loaded = await loadConversation(id);
      if (token !== tokenRef.current) return;
      setMessages(loaded);
      setConversationId(id);
      setShowHistory(false);
    } catch {
      if (token === tokenRef.current) setShowHistory(false);
    }
  };

  return (
    // z-40 keeps the bubble beneath z-50 modals (item customization bottom bar).
    <div className="zippy-anchor fixed bottom-4 right-4 z-40">
      {showLoginPopup && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Sign in required"
          className="mb-3 w-[min(24rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-brand-ink-muted/15 bg-brand-surface p-4 shadow-xl"
        >
          <p className="mb-3 text-sm text-brand-ink">{ZIPPY_LOGIN_REQUIRED_MESSAGE}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowLoginPopup(false)} className="rounded-full border border-brand-ink-muted/30 px-4 py-1 text-sm">
              Close
            </button>
            <Link href="/customer/login" onClick={() => setShowLoginPopup(false)} className="rounded-full bg-brand-primary-text-safe px-4 py-1 text-sm font-semibold text-white">
              Register or log in
            </Link>
          </div>
        </section>
      )}
      {open && (
        <section
          role="dialog"
          aria-label={ZIPPY_NAME}
          className="mb-3 flex h-[min(34rem,calc(100vh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius-card)] border border-brand-ink-muted/15 bg-brand-surface shadow-xl"
        >
          <header className="flex items-center gap-2 bg-brand-primary-text-safe px-4 py-3 text-white">
            <h2 className="flex-1 text-base font-bold">{ZIPPY_NAME}</h2>
            {userId && (
              <button type="button" onClick={showHistory ? () => setShowHistory(false) : openHistory} className="rounded-full px-3 py-1 text-sm hover:bg-white/15">
                {showHistory ? "Chat" : "History"}
              </button>
            )}
            <button type="button" onClick={reset} className="rounded-full px-3 py-1 text-sm hover:bg-white/15">
              New chat
            </button>
            <button type="button" aria-label="Close Zippy" onClick={() => setOpen(false)} className="rounded-full px-2 py-1 text-lg leading-none hover:bg-white/15">
              ×
            </button>
          </header>

          <div ref={listRef} aria-live="polite" aria-busy={busy} className="flex-1 space-y-3 overflow-y-auto bg-brand-bg p-3">
            {showHistory ? (
              conversations.length === 0 ? (
                <p className="text-sm text-brand-ink-muted">No saved chats yet.</p>
              ) : (
                conversations.map((c) => (
                  <button key={c.id} type="button" onClick={() => resume(c.id)} className="block w-full rounded-2xl bg-brand-surface px-3 py-2 text-left text-sm text-brand-ink hover:bg-brand-primary/10">
                    {c.title}
                  </button>
                ))
              )
            ) : (
              <>
                <p className="max-w-[85%] rounded-2xl bg-brand-surface px-3 py-2 text-sm text-brand-ink">{ZIPPY_WELCOME}</p>
                {messages.length === 0 && (
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button key={q} type="button" onClick={() => send(q)} className="rounded-full border border-brand-primary-text-safe/40 bg-brand-surface px-3 py-1 text-sm text-brand-primary-text-safe hover:bg-brand-primary/10">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={m.id ?? `i${i}`} className="flex flex-col gap-2">
                    {(m.content !== "" || m.role === "user" || !m.actions?.length || (busy && i === messages.length - 1)) && (
                    <p
                      className={
                        m.role === "user"
                          ? "ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-brand-ink px-3 py-2 text-sm text-white"
                          : "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-brand-surface px-3 py-2 text-sm text-brand-ink"
                      }
                    >
                      {m.content || (busy && i === messages.length - 1 ? "…" : "")}
                    </p>
                    )}
                    {m.role === "assistant" && m.actions && m.actions.length > 0 && <ActionCards cards={m.actions} cart={cart} onNavigate={() => setOpen(false)} states={cardStates} setStates={setCardStates} executed={executedCards} />}
                  </div>
                ))}
              </>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-brand-ink-muted/15 bg-brand-surface p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={MAX_MESSAGE_CHARS}
              placeholder="Ask Zippy a question…"
              aria-label="Your question"
              className="min-w-0 flex-1 rounded-full border border-brand-ink-muted/30 px-4 py-2 text-sm text-brand-ink outline-none focus:border-brand-primary-text-safe"
            />
            <button type="submit" disabled={busy || input.trim() === ""} className="rounded-full bg-brand-primary-text-safe px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Send
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        aria-label={open ? "Close Zippy" : `Open ${ZIPPY_NAME}`}
        aria-expanded={open}
        onClick={() => {
          // Wait for the session check, then send signed-out visitors to the popup instead of a chat.
          if (!authResolved) return;
          if (!userId) return setShowLoginPopup(true);
          setOpen((v) => !v);
        }}
        className="ml-auto flex items-center gap-2 rounded-full bg-brand-primary-text-safe px-5 py-3 text-sm font-bold text-white shadow-lg hover:opacity-90"
      >
        <span aria-hidden>⚡</span>
        {ZIPPY_NAME}
      </button>
    </div>
  );
}
