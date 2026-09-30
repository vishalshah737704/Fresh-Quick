"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Forces a fresh (logged-out) state whenever the Next.js server process has
// restarted since this browser last checked, while leaving a live session
// untouched across ordinary reloads/navigation within the same server
// lifetime. Supabase's browser client persists its session in localStorage
// by default, which otherwise survives a full server restart and silently
// auto-logs the user back in — undesired per project requirement.
//
// Mechanism: the server exposes a per-process-start epoch (Date.now() at
// module load, see lib/server-epoch.ts) via GET /api/auth/server-epoch. On
// mount, this component fetches that epoch and compares it against the
// last epoch this browser saw (localStorage). A mismatch (or first visit)
// means the server has restarted since this browser last confirmed a
// matching epoch, so any locally-persisted session is signed out before
// the stored epoch is updated. A match means the server has stayed up the
// whole time, so nothing happens and the existing session is left alone.
//
// Limitation: see lib/server-epoch.ts for the multi-instance caveat. Also,
// this only fires on components mounting this guard (every page, since it
// lives in the root layout) — a session is not proactively invalidated the
// instant the server restarts, only the next time the browser loads/reloads
// a page after that restart.
const EPOCH_STORAGE_KEY = "fresh-quick-server-epoch";

export function SessionEpochGuard() {
  useEffect(() => {
    let cancelled = false;

    async function checkEpoch() {
      try {
        const res = await fetch("/api/auth/server-epoch", { cache: "no-store" });
        if (!res.ok) return;
        const { epoch } = (await res.json()) as { epoch: number };
        if (cancelled) return;

        const lastKnown = window.localStorage.getItem(EPOCH_STORAGE_KEY);
        const epochStr = String(epoch);

        if (lastKnown !== epochStr) {
          await supabase.auth.signOut();
          window.localStorage.setItem(EPOCH_STORAGE_KEY, epochStr);
        }
      } catch {
        // Network hiccup fetching the epoch — fail open (don't sign the
        // user out speculatively); it will be re-checked on next load.
      }
    }

    checkEpoch();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
