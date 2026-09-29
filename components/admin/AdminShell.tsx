"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { AdminSessionContext } from "@/components/admin/AdminSessionContext";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { loading, adminId } = useAdminSession();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

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
          className={`${drawerOpen ? "flex" : "hidden"} w-full flex-col gap-2 bg-brand-ink p-4 text-white md:flex md:w-56 md:min-h-screen`}
        >
          <span className="mb-2 hidden font-heading text-lg text-white md:block">Admin</span>
          <span className="rounded-[var(--radius-pill)] bg-brand-primary px-3 py-2 text-sm text-white">
            Dashboard
          </span>
          <button
            onClick={signOut}
            className="mt-auto rounded-[var(--radius-pill)] px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10"
          >
            Sign out
          </button>
        </aside>
        <main className="flex-1 bg-brand-bg p-4">{children}</main>
      </div>
    </AdminSessionContext.Provider>
  );
}
