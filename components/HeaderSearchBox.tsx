"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RestaurantOption = { id: string; name: string; cuisine_tags: string[] };
type DishMatch = { id: string; name: string; store_id: string; store_name: string };

export function HeaderSearchBox({
  value,
  onChange,
  restaurants,
  cuisines,
}: {
  value: string;
  onChange: (value: string) => void;
  restaurants: RestaurantOption[];
  cuisines: { slug: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dishMatches, setDishMatches] = useState<DishMatch[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();
    if (query === "") {
      setDishMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, store_id, stores!inner(name, is_open, is_suspended)")
        .ilike("name", `%${query}%`)
        .eq("is_available", true)
        .eq("stores.is_open", true)
        .eq("stores.is_suspended", false)
        .limit(8);
      if (cancelled) return;
      const rows = (data ?? []) as unknown as {
        id: string;
        name: string;
        store_id: string;
        stores: { name: string } | { name: string }[];
      }[];
      setDishMatches(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          store_id: row.store_id,
          store_name: Array.isArray(row.stores) ? row.stores[0]?.name ?? "" : row.stores.name,
        }))
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const labelBySlug = new Map(cuisines.map((c) => [c.slug, c.label]));

  const query = value.trim().toLowerCase();
  const restaurantMatches =
    query === ""
      ? []
      : restaurants
          .filter(
            (r) =>
              r.name.toLowerCase().includes(query) ||
              r.cuisine_tags.some(
                (t) =>
                  t.toLowerCase().includes(query) ||
                  (labelBySlug.get(t) ?? "").toLowerCase().includes(query)
              )
          )
          .slice(0, 8);

  const showDropdown = open && query !== "" && (restaurantMatches.length > 0 || dishMatches.length > 0 || true);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search restaurants or cuisines"
        className="w-full rounded-[var(--radius-pill)] border border-brand-ink-muted/20 bg-brand-surface px-4 py-2 text-sm text-brand-ink placeholder:text-brand-ink-muted/60 focus:border-brand-primary focus:outline-none"
      />
      {showDropdown && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface shadow-[0_3px_14px_-6px_rgba(0,0,0,0.18)]">
          {restaurantMatches.length > 0 && (
            <div>
              {restaurantMatches.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setOpen(false);
                    router.push(`/customer/stores/${r.id}`);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-brand-accent/10"
                >
                  {r.name} — {r.cuisine_tags.map((t) => labelBySlug.get(t) ?? t).join(", ")}
                </button>
              ))}
            </div>
          )}
          {dishMatches.length > 0 && (
            <div className="border-t border-brand-ink-muted/10">
              {dishMatches.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setOpen(false);
                    router.push(`/customer/stores/${d.store_id}`);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-brand-accent/10"
                >
                  {d.name} <span className="text-brand-ink-muted">· {d.store_name}</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setOpen(false)}
            className="block w-full border-t border-brand-ink-muted/10 px-4 py-2 text-left text-sm font-medium text-brand-ink hover:bg-brand-accent/10"
          >
            Search for &quot;{value}&quot;
          </button>
        </div>
      )}
    </div>
  );
}
