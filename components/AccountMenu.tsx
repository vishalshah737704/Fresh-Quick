"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export function AccountMenu() {
  const router = useRouter();
  const { userId } = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("users")
      .select("full_name")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setName(data?.full_name ?? "");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!userId) return null;

  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/customer");
    router.refresh();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-brand-ink hover:bg-brand-accent/10"
      >
        ☰
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-56 rounded-lg border border-brand-ink-muted/10 bg-brand-surface py-2 shadow-lg">
          {name && (
            <p className="border-b border-brand-ink-muted/10 px-4 pb-2 font-semibold text-brand-ink">
              {name}
            </p>
          )}
          <Link
            href="/customer/orders"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-brand-ink hover:bg-brand-accent/10"
          >
            Orders
          </Link>
          <Link
            href="/customer/wallet"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-brand-ink hover:bg-brand-accent/10"
          >
            Wallet
          </Link>
          <Link
            href="/customer/help"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-brand-ink hover:bg-brand-accent/10"
          >
            Help
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="block w-full px-4 py-2 text-left text-sm text-brand-ink-muted hover:bg-brand-accent/10"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
