"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth";
import { customerFetch } from "@/lib/customer-api";
import type { InboxNotification } from "@/lib/notify-model";

const POLL_MS = 30_000;

type Tagged = { owner: string; count: number };

export function NotificationBell({ href, variant = "light" }: { href: string; variant?: "light" | "dark" }) {
  const { userId } = useSession();
  const [tagged, setTagged] = useState<Tagged | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await customerFetch<{ notifications: InboxNotification[]; unreadCount: number }>("/api/notifications");
        if (!cancelled && userId) setTagged({ owner: userId, count: res.unreadCount });
      } catch {
        // quiet on errors: the bell keeps its last count
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  if (!userId) return null;
  const count = tagged && tagged.owner === userId ? tagged.count : 0;
  const tone = variant === "dark" ? "text-white hover:bg-white/10" : "text-brand-ink hover:bg-brand-accent/10";

  return (
    <Link
      href={href}
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full text-xl ${tone}`}
    >
      <span aria-hidden="true">🔔</span>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-brand-primary-text-safe px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
