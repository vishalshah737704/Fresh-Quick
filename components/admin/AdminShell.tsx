"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { AdminSessionContext } from "@/components/admin/AdminSessionContext";
import { useProfile } from "@/lib/use-profile";
import { MyProfileSection } from "@/components/MyProfileSection";

const NAV_LINKS = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/registrations", label: "Registrations" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/delivery-partners", label: "Delivery Partners" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/coupons", label: "Coupons" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { loading, adminId } = useAdminSession();
  const profile = useProfile(adminId);
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!adminId) return;
    let cancelled = false;
    async function refresh() {
      try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/registrations/summary", {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        });
        const body = await res.json();
        if (!cancelled && res.ok) setPending(body.pending);
      } catch {
        // The badge is a convenience; a failed refresh keeps the last count.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [adminId, pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  if (loading) return <p className="p-4">Loading…</p>;

  return (
    <AdminSessionContext.Provider value={{ loading, adminId }}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <div className="flex items-center justify-between bg-brand-surface p-3 text-brand-ink md:hidden">
          <span className="font-heading text-lg text-brand-ink">Admin</span>
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
          <span className="mb-2 hidden font-heading text-lg text-white md:block">Admin</span>
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setDrawerOpen(false)}
                className={`rounded-[var(--radius-pill)] px-3 py-2 text-sm ${
                  active ? "bg-brand-primary-text-safe text-white" : "text-white/80 hover:bg-white/10"
                }`}
              >
                {link.label}
                {link.href === "/admin/registrations" && pending > 0 && (
                  <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-brand-ink">{pending}</span>
                )}
              </Link>
            );
          })}
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
            background: "linear-gradient(180deg, var(--color-brand-ink-tint) 0%, #fff 200px)",
          }}
        >
          {children}
        </main>
      </div>
    </AdminSessionContext.Provider>
  );
}
