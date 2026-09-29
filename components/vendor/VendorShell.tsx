"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSession } from "@/components/vendor/useVendorSession";
import { VendorSessionContext } from "@/components/vendor/VendorSessionContext";

const NAV_LINKS = [
  { href: "/vendor/dashboard", label: "Dashboard" },
  { href: "/vendor/menu", label: "Menu" },
  { href: "/vendor/orders", label: "Orders" },
];

export default function VendorShell({ children }: { children: React.ReactNode }) {
  const { loading, storeId } = useVendorSession();
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refreshIsOpen = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase.from("stores").select("is_open").eq("id", storeId).single();
    setIsOpen(data?.is_open ?? null);
  }, [storeId]);

  useEffect(() => {
    if (!loading && storeId) refreshIsOpen();
  }, [loading, storeId, refreshIsOpen]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/vendor/login");
  }

  if (loading) return <p className="p-4">Loading…</p>;

  if (!storeId) {
    return (
      <p className="p-4 text-sm text-red-600">
        No restaurant is linked to this account. Contact support.
      </p>
    );
  }

  return (
    <VendorSessionContext.Provider value={{ loading, storeId, isOpen, refreshIsOpen }}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <div className="flex items-center justify-between bg-brand-surface p-3 text-brand-ink md:hidden">
          <span className="font-heading text-lg text-brand-ink">Vendor</span>
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="rounded-[var(--radius-pill)] border border-brand-ink-muted/20 px-3 py-1 text-sm text-brand-ink"
          >
            Menu
          </button>
        </div>
        <aside
          className={`${drawerOpen ? "flex" : "hidden"} w-full flex-col gap-2 bg-brand-ink p-4 text-white md:flex md:w-56 md:min-h-screen`}
        >
          <span className="mb-2 hidden font-heading text-lg text-white md:block">Vendor</span>
          <span className="mb-2 inline-flex w-fit items-center rounded-[var(--radius-pill)] bg-brand-accent/20 px-3 py-1 text-xs font-medium text-white">
            {isOpen === null ? "…" : isOpen ? "Open" : "Closed"}
          </span>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              className={`rounded-[var(--radius-pill)] px-3 py-2 text-sm ${
                pathname === link.href
                  ? "bg-brand-primary text-white"
                  : "text-white/80 hover:bg-white/10"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="mt-auto rounded-[var(--radius-pill)] px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10"
          >
            Sign out
          </button>
        </aside>
        <main className="flex-1 bg-brand-bg p-4">{children}</main>
      </div>
    </VendorSessionContext.Provider>
  );
}
