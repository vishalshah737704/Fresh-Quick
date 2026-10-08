"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { customerFetch } from "@/lib/customer-api";
import { reportReviewPath } from "@/lib/reviews-model";

const REASONS = ["Offensive or abusive", "Spam or fake", "Not about this store"];

export function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function report(reason: string) {
    setError(null);
    try {
      await customerFetch(reportReviewPath(reviewId), { method: "POST", body: { reason } });
      setDone(true);
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not report";
      if (message === "Not signed in") router.push(`/customer/login?redirectTo=${encodeURIComponent(pathname)}`);
      else setError(message);
    }
  }

  if (done) return <span className="text-xs text-brand-ink-muted">Reported, thank you</span>;
  return (
    <span className="text-xs text-brand-ink-muted">
      <button type="button" className="underline" onClick={() => setOpen((value) => !value)}>
        Report
      </button>
      {open && (
        <span className="ml-2 inline-flex flex-wrap gap-2">
          {REASONS.map((reason) => (
            <button key={reason} type="button" className="rounded-full border px-2 py-0.5" onClick={() => report(reason)}>
              {reason}
            </button>
          ))}
        </span>
      )}
      {error && <span className="ml-2 text-brand-danger-text-safe">{error}</span>}
    </span>
  );
}
