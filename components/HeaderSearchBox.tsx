"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RestaurantOption = { id: string; name: string; cuisine_tags: string[] };
type DishMatch = { id: string; name: string; restaurant_id: string; restaurant_name: string };

export function HeaderSearchBox({
  value,
  onChange,
  restaurants,
}: {
  value: string;
  onChange: (value: string) => void;
  restaurants: RestaurantOption[];
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
        .from("menu_items")
        .select("id, name, restaurant_id, restaurants!inner(name, is_open, is_suspended)")
        .ilike("name", `%${query}%`)
        .eq("is_available", true)
        .eq("restaurants.is_open", true)
        .eq("restaurants.is_suspended", false)
        .limit(8);
      if (cancelled) return;
      const rows = (data ?? []) as unknown as {
        id: string;
        name: string;
        restaurant_id: string;
        restaurants: { name: string } | { name: string }[];
      }[];
      setDishMatches(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          restaurant_id: row.restaurant_id,
          restaurant_name: Array.isArray(row.restaurants) ? row.restaurants[0]?.name ?? "" : row.restaurants.name,
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

  const query = value.trim().toLowerCase();
  const restaurantMatches =
    query === ""
      ? []
      : restaurants
          .filter(
            (r) =>
              r.name.toLowerCase().includes(query) ||
              r.cuisine_tags.some((t) => t.toLowerCase().includes(query))
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
        className="w-full rounded-full border border-brand-ink-muted/20 bg-brand-surface px-4 py-2 text-sm text-brand-ink placeholder:text-brand-ink-muted/60 focus:border-brand-primary focus:outline-none"
      />
      {showDropdown && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-brand-ink-muted/10 bg-brand-surface shadow-[0_3px_14px_-6px_rgba(0,0,0,0.18)]">
          {restaurantMatches.length > 0 && (
            <div>
              {restaurantMatches.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setOpen(false);
                    router.push(`/customer/restaurants/${r.id}`);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-brand-accent/10"
                >
                  {r.name} — {r.cuisine_tags.join(", ")}
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
                    router.push(`/customer/restaurants/${d.restaurant_id}`);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-brand-accent/10"
                >
                  {d.name} <span className="text-brand-ink-muted">· {d.restaurant_name}</span>
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
