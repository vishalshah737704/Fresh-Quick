"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDeliverySession } from "@/components/delivery/useDeliverySession";
import { DeliverySessionContext } from "@/components/delivery/DeliverySessionContext";
import { useProfile } from "@/lib/use-profile";
import { MyProfileSection } from "@/components/MyProfileSection";

const NAV_LINKS = [
  { href: "/delivery/dashboard", label: "Dashboard" },
  { href: "/delivery/history", label: "History" },
];

export default function DeliveryShell({ children }: { children: React.ReactNode }) {
  const { loading, partnerId, isOnline: initialOnline } = useDeliverySession();
  const profile = useProfile(partnerId);
  const pathname = usePathname();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading) setIsOnline(initialOnline);
  }, [loading, initialOnline]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/delivery/login");
  }

  if (loading) return <p className="p-4">Loading…</p>;

  return (
    <DeliverySessionContext.Provider value={{ loading, partnerId, isOnline, setIsOnline }}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <div className="flex items-center justify-between bg-brand-surface p-3 text-brand-ink md:hidden">
          <span className="font-heading text-lg text-brand-ink">Delivery</span>
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="rounded-[var(--radius-pill)] border border-brand-ink-muted/20 px-3 py-1 text-sm text-brand-ink"
          >
            Menu
          </button>
        </div>
        <aside
          className={`${drawerOpen ? "flex" : "hidden"} w-full flex-col gap-2 p-4 text-white md:flex md:w-56 md:min-h-screen`}
          style={{ background: "linear-gradient(180deg, var(--color-brand-ink) 0%, #132849 100%)" }}
        >
          <span className="mb-2 hidden font-heading text-lg text-white md:block">Delivery</span>
          <span className="mb-2 inline-flex w-fit items-center rounded-[var(--radius-pill)] bg-brand-accent/20 px-3 py-1 text-xs font-medium text-white">
            {isOnline ? "Online" : "Offline"}
          </span>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              className={`rounded-[var(--radius-pill)] px-3 py-2 text-sm ${
                pathname === link.href
                  ? "bg-brand-primary-text-safe text-white"
                  : "text-white/80 hover:bg-white/10"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-auto border-t border-white/10 pt-3">
            <MyProfileSection profile={profile} variant="dark" />
          </div>
          <button
            onClick={signOut}
            className="rounded-[var(--radius-pill)] px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10"
          >
            Sign out
          </button>
        </aside>
        <main
          className="flex-1 p-4"
          style={{
            background: "linear-gradient(180deg, var(--color-brand-primary-tint) 0%, #fff 200px)",
          }}
        >
          {children}
        </main>
      </div>
    </DeliverySessionContext.Provider>
  );
}
