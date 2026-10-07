"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFavorites } from "@/lib/favorites-store";

export function FavoriteHeart({ storeId, className = "" }: { storeId: string; className?: string }) {
  const { isFavorite, toggle } = useFavorites();
  const router = useRouter();
  const pathname = usePathname();
  const [failed, setFailed] = useState(false);
  const on = isFavorite(storeId);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from favorites" : "Add to favorites"}
      title={failed ? "Could not update favorite" : undefined}
      className={`flex h-8 w-8 items-center justify-center rounded-full bg-brand-surface text-lg shadow ${className}`}
      onClick={async (event) => {
        // The card is wrapped in a Link; the heart must never navigate.
        event.preventDefault();
        event.stopPropagation();
        const result = await toggle(storeId);
        if (result === "login") router.push(`/customer/login?redirectTo=${encodeURIComponent(pathname)}`);
        setFailed(result === "failed");
      }}
    >
      <span className={on ? "text-brand-danger-text-safe" : "text-brand-ink"}>{on ? "♥" : "♡"}</span>
    </button>
  );
}
