"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth";
import { customerFetch } from "@/lib/customer-api";
import {
  DEFAULT_PREFERENCES,
  describeAge,
  type InboxNotification,
  type NotificationPreferences,
} from "@/lib/notify-model";

type ListResponse = { notifications: InboxNotification[]; unreadCount: number; nextCursor: string | null };
type PrefsResponse = { preferences: NotificationPreferences };

const TOGGLES: { key: keyof NotificationPreferences; label: string; available: boolean }[] = [
  { key: "orderUpdates", label: "Order updates", available: true },
  { key: "walletUpdates", label: "Wallet updates", available: true },
  { key: "promotions", label: "Promotions", available: true },
  { key: "push", label: "Push notifications", available: true },
  { key: "sms", label: "SMS", available: false },
  { key: "whatsapp", label: "WhatsApp", available: false },
];

async function markRead(ids: string[]) {
  if (ids.length === 0) return;
  await customerFetch("/api/notifications/read", { method: "POST", body: { ids } }).catch(() => {});
}

export function NotificationsPanel({ orderHref }: { orderHref: ((orderId: string) => string) | null }) {
  const { userId, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function init() {
      try {
        const res = await customerFetch<ListResponse>("/api/notifications");
        if (cancelled) return;
        setItems(res.notifications);
        setNextCursor(res.nextCursor);
        setLoaded(true);
        await markRead(res.notifications.filter((n) => !n.read).map((n) => n.id));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load notifications");
          setLoaded(true);
        }
      }
      try {
        const res = await customerFetch<PrefsResponse>("/api/notifications/preferences");
        if (!cancelled) setPrefs(res.preferences);
      } catch (e) {
        if (!cancelled) setPrefsError(e instanceof Error ? e.message : "Could not load settings");
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function markAllRead() {
    try {
      await customerFetch("/api/notifications/read", { method: "POST", body: { all: true } });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark as read");
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await customerFetch<ListResponse>(`/api/notifications?before=${encodeURIComponent(nextCursor)}`);
      setItems((prev) => [...prev, ...res.notifications]);
      setNextCursor(res.nextCursor);
      await markRead(res.notifications.filter((n) => !n.read).map((n) => n.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggle(key: keyof NotificationPreferences) {
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setPrefsError(null);
    try {
      const res = await customerFetch<PrefsResponse>("/api/notifications/preferences", {
        method: "PUT",
        body: { [key]: next[key] },
      });
      setPrefs(res.preferences);
    } catch (e) {
      setPrefs(previous);
      setPrefsError(e instanceof Error ? e.message : "Could not save settings");
    }
  }

  if (sessionLoading) return <p className="text-brand-ink-muted">Loading…</p>;
  if (!userId) return <p className="text-brand-ink-muted">Sign in to see your notifications.</p>;

  const hasUnread = items.some((n) => !n.read);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="font-heading text-2xl text-brand-ink">Notifications</h1>
          <button
            type="button"
            onClick={markAllRead}
            disabled={!hasUnread}
            className="rounded-[var(--radius-pill)] border border-brand-ink-muted/20 px-3 py-1 text-sm text-brand-ink hover:bg-brand-accent/10 disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {!loaded ? (
          <p className="text-brand-ink-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-brand-ink-muted">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-brand-ink-muted/10 rounded-2xl border border-brand-ink-muted/10 bg-brand-surface">
            {items.map((n) => {
              const href = n.orderId && orderHref ? orderHref(n.orderId) : null;
              const content = (
                <div className="flex gap-3 px-4 py-3">
                  <span
                    aria-label={n.read ? undefined : "Unread"}
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand-primary-text-safe"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-brand-ink">{n.title}</p>
                    <p className="text-sm text-brand-ink-muted">{n.body}</p>
                    <p className="mt-1 text-xs text-brand-ink-muted">{describeAge(n.createdAt)}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {href ? (
                    <Link href={href} className="block hover:bg-brand-accent/5">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {nextCursor && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-3 rounded-[var(--radius-pill)] border border-brand-ink-muted/20 px-4 py-2 text-sm text-brand-ink hover:bg-brand-accent/10 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-heading text-xl text-brand-ink">Notification settings</h2>
        {prefsError && <p className="mb-2 text-sm text-red-600">{prefsError}</p>}
        <ul className="divide-y divide-brand-ink-muted/10 rounded-2xl border border-brand-ink-muted/10 bg-brand-surface">
          {TOGGLES.map((t) => (
            <li key={t.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <label htmlFor={`pref-${t.key}`} className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-brand-ink">{t.label}</span>
                {!t.available && <span className="block text-xs text-brand-ink-muted">Not available yet</span>}
              </label>
              <input
                id={`pref-${t.key}`}
                type="checkbox"
                role="switch"
                className="h-5 w-5 accent-[var(--color-brand-primary)]"
                checked={t.available ? prefs[t.key] : false}
                disabled={!t.available}
                onChange={() => void toggle(t.key)}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
