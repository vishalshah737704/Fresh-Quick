"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AutoOrderCard() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings/auto-order", { headers: await authHeader() });
        const body = await res.json();
        if (res.ok) setEnabled(body.enabled === true);
        else setMessage(body.error ?? "Failed to load the setting");
      } catch {
        setMessage("Failed to load the setting");
      }
      setLoaded(true);
    })();
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings/auto-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ enabled: next }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error ?? "Failed to save the setting");
      } else {
        setEnabled(body.enabled === true);
        if (body.enabled && !body.sweepStarted) {
          setMessage("Saved, but n8n did not respond, so open orders were not started. Check that n8n is running.");
        }
      }
    } catch {
      setMessage("Failed to save the setting");
    }
    setSaving(false);
  }

  return (
    <div className="mb-6 rounded-[var(--radius-card)] bg-white p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={enabled}
          disabled={!loaded || saving}
          onChange={(event) => void toggle(event.target.checked)}
        />
        <span>
          <span className="block font-semibold text-brand-ink">Automatic order acceptance (demo mode)</span>
          <span className="block text-sm text-brand-ink-muted">
            When on, every paid order is accepted, prepared, marked ready and picked up by itself, 3 seconds
            apart. Vendors and delivery partners do nothing. Needs n8n running.
          </span>
        </span>
      </label>
      {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
    </div>
  );
}
