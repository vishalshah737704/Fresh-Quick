"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { MenuItemRow } from "@/components/MenuItemRow";
import { RestaurantMenuAnchorNav } from "@/components/RestaurantMenuAnchorNav";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
  category: string | null;
};

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  lat: number;
  lng: number;
  is_suspended: boolean;
  banner_url: string | null;
};

type MenuGroup = { key: string; label: string; items: MenuItem[] };

function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug || "group";
}

// Groups by category in first-seen order; a null OR blank/whitespace-only
// category (the vendor edit form writes "" when a vendor clears the field,
// not null) is bucketed into a trailing "Other" group regardless of where
// it appeared in the fetched list. Called with the already search-filtered
// items, so a category with zero remaining matches is simply never added
// here. Slugs are de-duplicated across labels that collide once slugified
// (trailing-space variants, case variants, non-Latin labels, or a real
// "Other" category alongside blank items) so two distinct groups never
// share a key/section id.
function buildGroups(items: MenuItem[]): MenuGroup[] {
  const byCategory = new Map<string, MenuItem[]>();
  const uncategorized: MenuItem[] = [];
  for (const item of items) {
    const label = item.category?.trim();
    if (!label) {
      uncategorized.push(item);
      continue;
    }
    const bucket = byCategory.get(label);
    if (bucket) bucket.push(item);
    else byCategory.set(label, [item]);
  }
  const usedKeys = new Set<string>();
  function uniqueKey(label: string): string {
    const base = slugify(label);
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${base}-${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return key;
  }
  const groups: MenuGroup[] = Array.from(byCategory.entries()).map(([label, groupItems]) => ({
    key: uniqueKey(label),
    label,
    items: groupItems,
  }));
  if (uncategorized.length > 0) {
    groups.push({ key: uniqueKey("Other"), label: "Other", items: uncategorized });
  }
  return groups;
}

export default function RestaurantMenuPage() {
  const params = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: r, error: rErr }, { data: items, error: iErr }] =
        await Promise.all([
          supabase
            .from("restaurants")
            .select("id, name, cuisine_tags, rating, avg_prep_minutes, is_open, lat, lng, is_suspended, banner_url")
            .eq("id", params.id)
            .single(),
          supabase
            .from("menu_items")
            .select("id, name, description, price, is_veg, is_available, image_url, category")
            .eq("restaurant_id", params.id),
        ]);
      if (cancelled) return;
      if (rErr || iErr) {
        setError((rErr ?? iErr)?.message ?? "Failed to load");
        return;
      }
      setRestaurant(r);
      setMenuItems(items ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const query = searchQuery.trim().toLowerCase();
  const filteredItems = (menuItems ?? []).filter(
    (item) =>
      query === "" ||
      item.name.toLowerCase().includes(query) ||
      (item.description ?? "").toLowerCase().includes(query)
  );
  const groups = buildGroups(filteredItems);
  const useGroupedView = groups.length >= 2;

  // Scroll-spy: highlight whichever grouped section is most visible.
  // Re-runs whenever the rendered section set changes (new search query,
  // grouped view toggling on/off) so it always observes the current DOM.
  useEffect(() => {
    if (!useGroupedView) {
      setActiveKey(null);
      return;
    }
    const sections = Array.from(sectionRefs.current.values());
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        setActiveKey(visible[0].target.id.replace("category-", ""));
      },
      { rootMargin: "-88px 0px -70% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach((section) => observer.observe(section));
    if (activeKey === null) setActiveKey(groups[0].key);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useGroupedView, groups.map((g) => g.key).join(",")]);

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load menu: {error}</p>;
  }

  if (!restaurant || menuItems === null) {
    return <p className="text-brand-ink-muted">Loading menu…</p>;
  }

  if (menuItems.length === 0) {
    return <p className="text-brand-ink-muted">{restaurant.name} has no menu items yet.</p>;
  }

  const isUnavailable = !restaurant.is_open || restaurant.is_suspended;

  function registerSection(key: string, el: HTMLElement | null) {
    if (el) sectionRefs.current.set(key, el);
    else sectionRefs.current.delete(key);
  }

  function scrollToGroup(key: string) {
    sectionRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveKey(key);
  }

  return (
    <div>
      <div className="relative mb-6 h-64 w-full overflow-hidden rounded-lg bg-brand-accent/10">
        {restaurant.banner_url ? (
          <Image
            src={restaurant.banner_url}
            alt={restaurant.name}
            fill
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-6xl">🍽️</div>
        )}
      </div>
      <h1 className="mb-1 text-2xl font-bold text-brand-ink">{restaurant.name}</h1>
      <p className="mb-4 text-sm text-brand-ink-muted">
        {restaurant.cuisine_tags.join(", ")} · ⭐ {restaurant.rating.toFixed(1)} · {restaurant.avg_prep_minutes} min
      </p>
      {isUnavailable && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {restaurant.is_suspended
            ? "This restaurant is currently unavailable."
            : "This restaurant is currently closed."}
        </div>
      )}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search this menu"
        className="mb-4 w-full rounded-lg border border-brand-ink-muted/20 bg-brand-surface px-4 py-2 text-sm text-brand-ink focus:border-brand-primary focus:outline-none"
      />
      {filteredItems.length === 0 ? (
        <p className="text-brand-ink-muted">No items match &quot;{searchQuery}&quot;.</p>
      ) : useGroupedView ? (
        <>
          <RestaurantMenuAnchorNav
            groups={groups.map(({ key, label }) => ({ key, label }))}
            activeKey={activeKey}
            onSelect={scrollToGroup}
          />
          <div className="flex flex-col gap-6 pt-4">
            {groups.map((group) => (
              <section
                key={group.key}
                id={`category-${group.key}`}
                ref={(el) => registerSection(group.key, el)}
                className="scroll-mt-16"
              >
                <h2 className="mb-2 text-lg font-bold text-brand-ink">{group.label}</h2>
                <div className="flex flex-col divide-y divide-brand-ink-muted/10 rounded-lg border border-brand-ink-muted/10 bg-brand-surface px-4">
                  {group.items.map((item) => (
                    <MenuItemRow
                      key={item.id}
                      item={item}
                      restaurantId={restaurant.id}
                      restaurantName={restaurant.name}
                      disabled={isUnavailable}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col divide-y divide-brand-ink-muted/10 rounded-lg border border-brand-ink-muted/10 bg-brand-surface px-4">
          {filteredItems.map((item) => (
            <MenuItemRow
              key={item.id}
              item={item}
              restaurantId={restaurant.id}
              restaurantName={restaurant.name}
              disabled={isUnavailable}
            />
          ))}
        </div>
      )}
    </div>
  );
}
