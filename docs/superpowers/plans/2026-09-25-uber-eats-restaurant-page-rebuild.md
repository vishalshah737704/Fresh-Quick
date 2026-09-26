# Uber Eats-style redesign — Piece 3: Restaurant Page Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the customer restaurant/menu page toward Uber Eats' pattern — a sticky category anchor-nav with scroll-spy, an in-menu search box, and a "Quick Add" restyle of the existing instant-add button — using the `menu_items.category` column that already exists, with no new schema or customization logic.

**Architecture:** `app/customer/restaurants/[id]/page.tsx` already fetches the restaurant row and its menu items client-side in one `useEffect`. This plan adds a pure derivation step (search-filter the fetched items, then group the filtered items by `category`, bucketing nulls into a trailing "Other" group) entirely in that page component — no new Supabase query. A new presentational component (`RestaurantMenuAnchorNav`) renders the sticky pill row and receives an `activeKey` computed by an `IntersectionObserver` the page sets up over its own rendered `<section>` elements. `MenuItemRow` gets a pure visual restyle — its props, its `addItem` call, and its disabled logic are unchanged.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + PostgREST via `@supabase/supabase-js`), TypeScript, Tailwind CSS v4, native `IntersectionObserver` (no new dependency).

**Spec:** `docs/superpowers/specs/2026-09-25-uber-eats-restaurant-page-rebuild-design.md`

## Global Constraints

- No new database migration, schema, or RLS policy — `menu_items.category` already exists and is already publicly readable via the existing menu-items read policy.
- "Quick Add" is a pure restyle: the `addItem(restaurantId, restaurantName, { menuItemId, name, price, quantity: 1 })` call in `MenuItemRow` must remain byte-identical in its arguments — only the button's shape/position/label changes.
- Colors/fonts/radius/shadow: reuse piece 1's tokens exactly (`bg-brand-primary`, `bg-brand-accent`, `bg-brand-surface`, `text-brand-ink`, `text-brand-ink-muted`, `rounded-lg` for cards/images, `rounded-full` for pill/circular buttons). Section headings use `text-lg font-bold text-brand-ink` — matching `CuisineCarouselRow`'s existing heading style, not the `.font-heading` class (that's reserved for hero/page-level headings per piece 1's own forward note; a restaurant/category heading is neither).
- `npm run build` must pass — full output including the "Running TypeScript ..." phase, not just the Turbopack "Compiled successfully" line — after every task.
- No automated test framework exists in this project; verification is `npm run build` plus a live Playwright walkthrough against the real local Supabase stack, per every prior piece in this redesign.

## Review Focus

- **A restaurant where every item has the same single category** (e.g. all "Mains"): must fall back to the flat list with no anchor-nav, not render a nav with one lonely pill — the spec's "0 or 1 groups" threshold must be checked against the actual group count, not just "is `category` non-null".
- **Typing a search query that matches items across every category vs. one that empties every group**: groups with zero remaining matches (and their pill) must disappear entirely rather than rendering an empty section heading with nothing under it, and an all-groups-empty query must show the "No items match" message instead of an empty page.
- **A restaurant with `image_url: null` on some menu items**: the corner Quick Add button must still render correctly positioned over the placeholder block, not just over a real `<Image>` — an implementer restyling around the `<Image>` tag alone could miss the null branch.
- **The closed/suspended restaurant banner combined with the new search box**: `isUnavailable` must still disable every visible `MenuItemRow`'s add button after filtering/grouping is applied, not just in the original flat-list code path — a restructuring that forks the render into two branches (grouped vs. flat) risks forgetting to pass `disabled` down one of them.
- **Scroll-spy on a very short menu that never fills the viewport** (e.g. 2 items in 2 categories): the `IntersectionObserver` must still highlight a pill (typically the first section, already in view on load) rather than leaving `activeKey` stuck at `null` because every section is simultaneously "visible" and none crosses the observer's margin threshold in the way a longer page would.

---

## File Structure

- Create: `components/RestaurantMenuAnchorNav.tsx` — sticky pill row + active-state styling, purely presentational (receives `groups`, `activeKey`, `onSelect`)
- Modify: `components/MenuItemRow.tsx` — visual restyle (image-right, corner `+` button); no prop or behavior changes
- Modify: `app/customer/restaurants/[id]/page.tsx` — add `category` to the fetch, add search state, add grouping derivation, add scroll-spy `IntersectionObserver`, render the anchor-nav + sectioned list or the flat-list fallback

---

### Task 1: Restyle `MenuItemRow` (Quick Add corner button)

**Files:**
- Modify: `components/MenuItemRow.tsx`

**Interfaces:**
- Consumes: nothing new — same `MenuItem` shape (`id, name, description, price, is_veg, is_available, image_url`), same `restaurantId`/`restaurantName`/`disabled` props as today.
- Produces: same public component signature `MenuItemRow({ item, restaurantId, restaurantName, disabled })` — Task 3 renders it unchanged from both the grouped and flat-list branches.

- [ ] **Step 1: Replace the component body with the restyled layout**

Replace the full contents of `components/MenuItemRow.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useCart } from "@/lib/cart-store";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
};

export function MenuItemRow({
  item,
  restaurantId,
  restaurantName,
  disabled = false,
}: {
  item: MenuItem;
  restaurantId: string;
  restaurantName: string;
  disabled?: boolean;
}) {
  const { addItem } = useCart();
  const canAdd = !disabled && item.is_available;

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-brand-ink">
          {item.is_veg ? "🟢" : "🔴"} {item.name}
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-brand-ink-muted">{item.description}</p>
        )}
        <p className="mt-1 text-sm font-semibold text-brand-ink">₹{item.price.toFixed(2)}</p>
        {!canAdd && (
          <p className="mt-1 text-xs text-brand-ink-muted">
            {disabled ? "Restaurant unavailable" : "Currently unavailable"}
          </p>
        )}
      </div>
      <div className="relative h-[72px] w-[72px] shrink-0">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-lg object-cover"
          />
        ) : (
          <div className="h-[72px] w-[72px] rounded-lg bg-brand-accent/10" />
        )}
        <button
          disabled={!canAdd}
          onClick={() =>
            addItem(restaurantId, restaurantName, {
              menuItemId: item.id,
              name: item.name,
              price: item.price,
              quantity: 1,
            })
          }
          aria-label={`Add ${item.name}`}
          className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-accent text-base font-bold leading-none text-brand-ink shadow-md disabled:cursor-not-allowed disabled:bg-brand-ink-muted/30 disabled:text-brand-ink-muted disabled:opacity-60"
        >
          +
        </button>
      </div>
    </div>
  );
}
```

Note the outer wrapping `<div>` no longer draws its own bottom border — Task 3's container (a `divide-y` list, same pattern the current page already uses) supplies the row separators between items, so this component doesn't need to know whether it's the last item in its list.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: Turbopack "Compiled successfully", then a "Running TypeScript ..." phase that also succeeds, with no errors. (This step will show a pre-existing type error from `app/customer/restaurants/[id]/page.tsx` if that file still renders `MenuItemRow` with its old container div — that's expected until Task 3; confirm the error, if any, is only in that file and not in `MenuItemRow.tsx` itself.)

- [ ] **Step 3: Commit**

```bash
git add components/MenuItemRow.tsx
git commit -m "feat: restyle MenuItemRow with corner Quick Add button"
```

---

### Task 2: Sticky anchor-nav component

**Files:**
- Create: `components/RestaurantMenuAnchorNav.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RestaurantMenuAnchorNav({ groups, activeKey, onSelect })` where `groups: { key: string; label: string }[]`, `activeKey: string | null`, `onSelect: (key: string) => void` — consumed by Task 3.

- [ ] **Step 1: Write the component**

```tsx
export function RestaurantMenuAnchorNav({
  groups,
  activeKey,
  onSelect,
}: {
  groups: { key: string; label: string }[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-brand-ink-muted/10 bg-brand-bg py-2">
      {groups.map((group) => (
        <button
          key={group.key}
          onClick={() => onSelect(group.key)}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
            activeKey === group.key
              ? "border-brand-primary bg-brand-primary text-white"
              : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
          }`}
        >
          {group.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: succeeds (this file isn't imported anywhere yet, so it just needs to type-check on its own).

- [ ] **Step 3: Commit**

```bash
git add components/RestaurantMenuAnchorNav.tsx
git commit -m "feat: add RestaurantMenuAnchorNav component"
```

---

### Task 3: Category grouping, search, and scroll-spy in the restaurant page

**Files:**
- Modify: `app/customer/restaurants/[id]/page.tsx`

**Interfaces:**
- Consumes: `MenuItemRow` (Task 1, unchanged props), `RestaurantMenuAnchorNav` (Task 2).
- Produces: the fully rebuilt page — no other task depends on this page's internals.

- [ ] **Step 1: Replace the full contents of the page**

```tsx
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

// Groups by category in first-seen order; every category-null item is
// bucketed into a trailing "Other" group regardless of where it appeared
// in the fetched list. Called with the already search-filtered items, so
// a category with zero remaining matches is simply never added here.
function buildGroups(items: MenuItem[]): MenuGroup[] {
  const byCategory = new Map<string, MenuItem[]>();
  for (const item of items) {
    if (item.category === null) continue;
    const bucket = byCategory.get(item.category);
    if (bucket) bucket.push(item);
    else byCategory.set(item.category, [item]);
  }
  const groups: MenuGroup[] = Array.from(byCategory.entries()).map(([label, groupItems]) => ({
    key: slugify(label),
    label,
    items: groupItems,
  }));
  const uncategorized = items.filter((item) => item.category === null);
  if (uncategorized.length > 0) {
    groups.push({ key: "other", label: "Other", items: uncategorized });
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
              <section key={group.key} id={`category-${group.key}`} ref={(el) => registerSection(group.key, el)}>
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
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: Turbopack "Compiled successfully", then "Running TypeScript ..." also succeeds, no errors, `/customer/restaurants/[id]` still listed in the route table.

- [ ] **Step 3: Commit**

```bash
git add app/customer/restaurants/\[id\]/page.tsx
git commit -m "feat: rebuild restaurant page with category anchor-nav and in-menu search"
```

---

### Task 4: Live verification across all three grouping cases

**Files:** none (verification only — no code changes expected unless this task's testing surfaces a bug, in which case fix it in the file it belongs to and re-run this task's steps)

**Interfaces:**
- Consumes: the fully rebuilt page and both new/restyled components from Tasks 1-3.
- Produces: nothing for later tasks — this is the plan's final gate.

Ensure Docker Desktop is running and the local Supabase stack is up (`npm run app:start` or confirm via `docker ps` that `supabase_db_*` containers are already `Up`) before starting.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or confirm one is already running)
Expected: ready on `http://localhost:3000` (or the next available port if 3000 is taken).

- [ ] **Step 2: Find or create one restaurant for each grouping case**

Query the seed data to find existing examples:

```bash
docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select restaurant_id, category, count(*) from public.menu_items group by restaurant_id, category order by restaurant_id;"
```

From the output, identify:
- One `restaurant_id` where every row's `category` is the same value or all `null` (single-group case).
- One `restaurant_id` with 2+ distinct non-null `category` values and zero `null` rows (all-real-categories case).
- One `restaurant_id` with a mix of non-null categories and at least one `null` row (mixed case).

If seed data doesn't already cover one of these cases, create it by logging into that restaurant's vendor account at `/vendor/login` and editing menu items' categories via the existing inline edit form on `/vendor/menu` (per `CLAUDE.md`'s existing vendor menu category field) — this is local dev data, not a schema or seed file change, so no migration or `seed.sql` edit is needed.

- [ ] **Step 3: Verify the single-group case**

Navigate to `/customer/restaurants/<single-group-id>` in a browser.
Expected: a flat vertical list of items, no sticky pill row above it, no category `<h2>` headings.

- [ ] **Step 4: Verify the all-real-categories case**

Navigate to `/customer/restaurants/<all-categories-id>`.
Expected: a sticky pill row appears listing only real category names (no "Other" pill), one `<h2>` section per category. Click each pill and confirm the page smooth-scrolls to that section. Scroll the page manually (without clicking a pill) and confirm the active (highlighted) pill updates to match whichever section is in view.

- [ ] **Step 5: Verify the mixed case**

Navigate to `/customer/restaurants/<mixed-id>`.
Expected: same as Step 4, plus a trailing "Other" pill/section containing exactly the items that have `category: null` in that restaurant's menu.

- [ ] **Step 6: Verify in-menu search**

On the mixed-case restaurant's page, type a query in the search box that matches an item name in only one category.
Expected: only that category's section (and pill) remains visible; every other section and its pill disappear. Clear the query and confirm everything reappears. Type a query matching nothing.
Expected: the page shows `No items match "<query>".` instead of any section or pill.

- [ ] **Step 7: Verify Quick Add still adds to cart correctly**

On any restaurant page, click a corner `+` button on an available item.
Expected: the cart panel (existing `CartPanel` component) opens or updates showing that item at the correct price and quantity 1 — same as the pre-restyle "Add" button's behavior.

- [ ] **Step 8: Verify the closed/suspended + unavailable-item disabled states**

Find or make a restaurant that is closed (`is_open = false`) or has `is_suspended = true`, and separately a menu item with `is_available = false`.
Expected: every item's corner `+` button is visually disabled (reduced opacity, not clickable) when the restaurant itself is unavailable, and an individual unavailable item's button is disabled even when the restaurant is otherwise open — confirm this holds in both the grouped-view and flat-list-view code paths (test one restaurant of each kind if the closed/suspended example and the single-group example aren't already the same restaurant).

- [ ] **Step 9: Verify a null `image_url` item and a short (2-item) menu's initial highlight**

Find a menu item with `image_url is null` (or set one to null via the vendor menu edit form on local dev data) and confirm its corner `+` button still renders correctly positioned over the placeholder block, not overlapping text or misplaced.
Then find or make a 2-category, 2-item restaurant (one item per category) and load its page without scrolling.
Expected: the first category's pill is already highlighted on load (not stuck unhighlighted) — confirms the `activeKey` initialization in the scroll-spy effect covers a menu too short to trigger a real scroll-based intersection change.

- [ ] **Step 10: Screenshot at desktop and mobile width**

Using Playwright (or the browser's own responsive mode), screenshot the all-real-categories restaurant page at desktop width and at 390px width.
Expected: no layout breakage, no console errors, sticky pill row remains usable (horizontally scrollable) at 390px.

- [ ] **Step 11: Final build check**

Run: `npm run build`
Expected: full success including the TypeScript phase — this is the plan's final gate before merge.
