"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth";
import { customerFetch } from "@/lib/customer-api";
import { formatPaise, ledgerKindLabel, type WalletEntry } from "@/lib/coupon-model";

type WalletData = {
  balancePaise: number;
  referralCode: string;
  referralRewardPaise: number;
  referralMaxRewards: number;
  referredCount: number;
  creditedCount: number;
  entries: WalletEntry[];
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function WalletPage() {
  const { userId, loading: sessionLoading } = useSession();
  // Tagged with the account it was fetched for, so another account never sees it.
  const [loaded, setLoaded] = useState<{ owner: string; wallet: WalletData | null; error: string | null } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    customerFetch<WalletData>("/api/customer/wallet")
      .then((wallet) => {
        if (!cancelled) setLoaded({ owner: userId, wallet, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            owner: userId,
            wallet: null,
            error: e instanceof Error ? e.message : "Could not load your wallet",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const current = loaded && loaded.owner === userId ? loaded : null;
  const wallet = current?.wallet ?? null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-ink">Wallet</h1>
      {sessionLoading || (userId && !current) ? (
        <p className="text-brand-ink-muted">Loading…</p>
      ) : !userId ? (
        <p className="text-brand-ink-muted">Please sign in to see your wallet.</p>
      ) : current?.error || !wallet ? (
        <p role="alert" className="text-sm text-red-600">
          {current?.error ?? "Could not load your wallet"}
        </p>
      ) : (
        <div className="flex max-w-2xl flex-col gap-4">
          <section className="rounded-[var(--radius-card)] border-t-4 border-brand-primary bg-brand-surface p-4 shadow-sm">
            <p className="text-sm text-brand-ink-muted">Wallet credit</p>
            <p className="text-3xl font-bold text-brand-ink">{formatPaise(wallet.balancePaise)}</p>
            <p className="mt-1 text-xs text-brand-ink-muted">
              Use it at checkout to pay part or all of an order.
            </p>
          </section>

          <section className="rounded-[var(--radius-card)] border-t-4 border-brand-accent bg-brand-surface p-4 shadow-sm">
            <h2 className="mb-2 font-semibold text-brand-ink">Refer a friend</h2>
            <div className="flex items-center gap-2">
              <code className="rounded bg-brand-accent-tint px-3 py-2 text-lg font-semibold tracking-wider text-brand-ink">
                {wallet.referralCode}
              </code>
              <button
                type="button"
                onClick={() => copyCode(wallet.referralCode)}
                className="rounded-full border border-brand-accent px-3 py-1.5 text-sm font-medium text-brand-ink"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-sm text-brand-ink-muted">
              You and a friend each get {formatPaise(wallet.referralRewardPaise)} after their first delivered
              order of ₹100 or more; up to {wallet.referralMaxRewards} rewards.
            </p>
            <p className="mt-2 text-sm text-brand-ink">
              Friends referred: {wallet.referredCount} · Rewards earned: {wallet.creditedCount}
            </p>
          </section>

          <section className="rounded-[var(--radius-card)] border-t-4 border-brand-ink bg-brand-surface p-4 shadow-sm">
            <h2 className="mb-2 font-semibold text-brand-ink">History</h2>
            {wallet.entries.length === 0 ? (
              <p className="text-sm text-brand-ink-muted">No wallet activity yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-brand-ink-muted/10">
                {wallet.entries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-brand-ink">{ledgerKindLabel(entry.kind)}</p>
                      <p className="text-xs text-brand-ink-muted">
                        {formatDate(entry.createdAt)}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </p>
                    </div>
                    <span
                      className={`font-semibold ${
                        entry.amountPaise >= 0 ? "text-brand-primary-text-safe" : "text-brand-ink"
                      }`}
                    >
                      {entry.amountPaise >= 0 ? "+" : "-"}
                      {formatPaise(Math.abs(entry.amountPaise))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-brand-ink-muted">
            Payments in this app are mock only; no real card or bank details are stored.
          </p>
        </div>
      )}
    </div>
  );
}
