"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { AdminSessionContext } from "@/components/admin/AdminSessionContext";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { loading, adminId } = useAdminSession();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  if (loading) return <p className="p-4">Loading…</p>;

  return (
    <AdminSessionContext.Provider value={{ loading, adminId }}>
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between border-b border-brand-ink-muted/10 bg-brand-surface p-3">
          <span className="font-heading text-lg text-brand-ink">Admin</span>
          <button
            onClick={signOut}
            className="rounded-full px-3 py-1 text-sm text-brand-ink-muted hover:bg-brand-accent/10"
          >
            Sign out
          </button>
        </div>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </AdminSessionContext.Provider>
  );
}
