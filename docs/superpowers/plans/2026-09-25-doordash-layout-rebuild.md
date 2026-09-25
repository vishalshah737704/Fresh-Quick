# DoorDash-Layout Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Fresh & Quick customer surface's layout to match doordash.com/home's structure — persistent left sidebar nav, a fuller header (search + address + disabled delivery/pickup toggle + cart), and cuisine-grouped horizontal carousel rows on the home page — without touching any cart/checkout/auth logic.

**Architecture:** All new pieces are presentational React components under `components/`, wired into the existing `app/customer/layout.tsx` (sidebar, header) and `app/customer/page.tsx` (carousel rows). `AddressPicker` moves from its own bar into the header row (its internal logic is untouched — only its outer wrapper markup changes so it fits inline). Restaurant grouping-by-cuisine is a client-side transform of the array `app/customer/page.tsx` already fetches, mirroring the transform the existing cuisine-chip filter already does on that same array.

**Tech Stack:** Next.js App Router (client components), Tailwind CSS with the existing `brand-*` theme tokens (`app/globals.css`), no new npm dependencies.

**Spec:** [docs/superpowers/specs/2026-09-25-doordash-layout-rebuild-design.md](../specs/2026-09-25-doordash-layout-rebuild-design.md)

## Global Constraints

- No new npm dependencies — carousel scroll uses native CSS `overflow-x-auto` + `scroll-snap-type`, not a JS library.
- No cart/checkout/auth logic changes — only presentation/layout markup. `useCart`, `useAddress`, `AddressPicker`'s internal state/handlers, `CartPanel`'s internal state/handlers stay byte-identical; only their JSX *wrapper* placement/classes may change.
- No `<a href>` tags for internal navigation — use `next/link`'s `Link` (project standing rule; `RestaurantCard.tsx` currently violates this and must be fixed as part of this work since this plan touches that file).
- Run `npm run build` (not just `tsc --noEmit`) before marking any page-level task done.
- All money/price display stays `.toFixed(2)` — this plan doesn't touch price logic, but `MenuItemRow`/`RestaurantCard` price display must remain unchanged if visible in a touched file.
- Sidebar has exactly 4 items (Home, Restaurants, Orders, Account) — no DoorDash product-vertical list.
- Delivery/Pickup toggle is visual-only; "Pickup" is permanently `disabled`.
- Carousel rows group by the existing 12-slug cuisine taxonomy; cuisines with zero open restaurants are omitted entirely (not rendered empty).

## Review Focus

- **Cuisine grouping with a restaurant in multiple cuisine_tags**: `Bella Italia` (or any restaurant with 2+ tags) must appear once per matching cuisine row, not be deduped into only its first tag — confirm the grouping transform iterates each restaurant's full `cuisine_tags` array, not just `cuisine_tags[0]`.
- **Zero-restaurant cuisine after filtering by open/suspended**: a cuisine slug present in `cuisine_taxonomy` but with no currently-open restaurant must produce no row at all, not an empty-heading row — this is explicit in the spec and easy to get backwards (checking taxonomy list length instead of grouped-restaurant list length).
- **Search box with no matches**: typing a search string that matches zero restaurants must show a clear empty state, not a silently-empty page section with no feedback.
- **Sidebar active-route highlighting on nested routes**: `/customer/restaurants/[id]` must still highlight the "Restaurants" sidebar item (prefix match on `/customer`), not fail to highlight anything just because the exact path doesn't equal any sidebar `href`.
- **Mobile viewport (390×844) with sidebar present**: the sidebar must not overlap or shrink the existing `CartPanel` fixed-bottom bar or push content under the fixed cart bar — verify at the same viewport Phase 8 used, since the spec permits the sidebar to collapse/hide on mobile but doesn't fully pin down the collapsed presentation, and a naive "always render 240px sidebar" would break small screens.

---

## File Structure

- **Create** `components/SidebarNav.tsx` — left rail, 4 static items, active-route highlighting via `usePathname()`.
- **Create** `components/DeliveryPickupToggle.tsx` — visual-only two-segment toggle, Pickup disabled.
- **Create** `components/CuisineCarouselRow.tsx` — heading + horizontal-scroll strip of `RestaurantCard`s for one cuisine.
- **Create** `components/HeaderSearchBox.tsx` — controlled text input, calls back up with the query string (no internal filtering logic — parent owns filtered state, same pattern as `CuisineChipRow`/`onSelect`).
- **Modify** `components/RestaurantCard.tsx` — swap `<a href>` for `next/link`'s `Link` (fixes the standing-rule violation found while reading this file for this plan; MEMORY.md's "no `<a href>` tags exist" note was stale).
- **Modify** `components/AddressPicker.tsx` — remove the outer `border-b border-gray-200 p-3` wrapper div's border/padding (those become the header row's job); keep every handler, every piece of state, and the dropdown panel's own markup unchanged.
- **Modify** `app/customer/layout.tsx` — add the header row (logo, `HeaderSearchBox`, relocated `AddressPicker`, `DeliveryPickupToggle`, cart-icon-with-badge, sign-in link) and `SidebarNav`, wrapping `children` in a flex layout (sidebar + main column).
- **Modify** `app/customer/page.tsx` — replace the flat grid with cuisine-grouped `CuisineCarouselRow`s when no chip filter is active; keep the existing single filtered grid when a chip is active.
- **Modify** `app/customer/restaurants/[id]/page.tsx` — density/polish pass only (spacing/typography classes), no structural or logic change.

No file here needs splitting — every existing file involved is already small and single-purpose.

---

### Task 1: Fix `RestaurantCard`'s `<a href>` and add a `next/link`-based smoke test point

**Files:**
- Modify: `components/RestaurantCard.tsx:1,21-22,51`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RestaurantCard` keeps its existing exported signature — `{ restaurant, distanceKm }` props, same `Restaurant` shape (`id, name, cuisine_tags, rating, avg_prep_minutes, is_open, banner_url`) — unchanged for every later task that renders it.

- [ ] **Step 1: Replace the `<a>` tag with `next/link`'s `Link`**

Edit `components/RestaurantCard.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  banner_url: string | null;
};

export function RestaurantCard({
  restaurant,
  distanceKm,
}: {
  restaurant: Restaurant;
  distanceKm: number;
}) {
  return (
    <Link
      href={`/customer/restaurants/${restaurant.id}`}
      className="block overflow-hidden rounded-xl border border-brand-ink-muted/10 bg-brand-surface shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-40 w-full bg-brand-accent/10">
        {restaurant.banner_url ? (
          <Image
            src={restaurant.banner_url}
            alt={restaurant.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">🍽️</div>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-white px-2 py-1 text-xs font-semibold shadow">
          ⭐ {restaurant.rating.toFixed(1)}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-brand-ink">{restaurant.name}</h3>
          <span className="text-sm text-brand-ink-muted">{distanceKm.toFixed(1)} km</span>
        </div>
        <p className="text-sm text-brand-ink-muted">{restaurant.cuisine_tags.join(", ")}</p>
        <span className="mt-1 inline-block rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-ink">
          {restaurant.avg_prep_minutes} min
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds, no type errors from the `Link` swap.

- [ ] **Step 3: Commit**

```bash
git add components/RestaurantCard.tsx
git commit -m "fix: use next/link instead of <a href> in RestaurantCard"
```

---

### Task 2: `SidebarNav` component

**Files:**
- Create: `components/SidebarNav.tsx`

**Interfaces:**
- Consumes: `usePathname()` from `next/navigation` (already used elsewhere in the app, e.g. `app/customer/restaurants/[id]/page.tsx` uses `useParams` from the same module).
- Produces: `SidebarNav` — no props, self-contained. Later tasks (`app/customer/layout.tsx`) import it as `<SidebarNav />`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/customer", label: "Home", icon: "🏠", match: (p: string) => p === "/customer" },
  {
    href: "/customer#restaurants",
    label: "Restaurants",
    icon: "🍽️",
    match: (p: string) => p.startsWith("/customer/restaurants"),
  },
  {
    href: "/customer/orders",
    label: "Orders",
    icon: "🧾",
    match: (p: string) => p.startsWith("/customer/orders"),
  },
  {
    href: "/customer/login",
    label: "Account",
    icon: "👤",
    match: (p: string) => p.startsWith("/customer/login"),
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 border-r border-brand-ink-muted/10 bg-brand-surface p-4 md:flex">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              active
                ? "bg-brand-primary/10 text-brand-primary"
                : "text-brand-ink-muted hover:bg-brand-accent/10"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

Note: `hidden ... md:flex` satisfies the Review Focus item on mobile — sidebar is entirely absent below the `md` breakpoint, so it cannot overlap `CartPanel`'s fixed bottom bar on the 390×844 viewport.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds (component isn't wired in yet, but must type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add components/SidebarNav.tsx
git commit -m "feat: add SidebarNav component"
```

---

### Task 3: `DeliveryPickupToggle` component

**Files:**
- Create: `components/DeliveryPickupToggle.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `DeliveryPickupToggle` — no props, self-contained. Later tasks import it as `<DeliveryPickupToggle />`.

- [ ] **Step 1: Write the component**

```tsx
export function DeliveryPickupToggle() {
  return (
    <div className="flex items-center rounded-full border border-brand-ink-muted/20 bg-brand-surface p-1 text-sm">
      <span className="rounded-full bg-brand-primary px-3 py-1 font-semibold text-white">
        Delivery
      </span>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Pickup isn't available yet"
        className="cursor-not-allowed rounded-full px-3 py-1 text-brand-ink-muted/50"
      >
        Pickup
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/DeliveryPickupToggle.tsx
git commit -m "feat: add visual-only DeliveryPickupToggle component"
```

---

### Task 4: `HeaderSearchBox` component

**Files:**
- Create: `components/HeaderSearchBox.tsx`

**Interfaces:**
- Consumes: nothing (controlled input, no internal store).
- Produces: `HeaderSearchBox` — props `{ value: string; onChange: (value: string) => void }`. `app/customer/page.tsx` (Task 6) owns `value`'s state and passes it down, same ownership pattern `CuisineChipRow`'s `selected`/`onSelect` already uses.

- [ ] **Step 1: Write the component**

```tsx
export function HeaderSearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search restaurants or cuisines"
      className="w-full max-w-md rounded-full border border-brand-ink-muted/20 bg-brand-surface px-4 py-2 text-sm text-brand-ink placeholder:text-brand-ink-muted/60 focus:border-brand-primary focus:outline-none"
    />
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/HeaderSearchBox.tsx
git commit -m "feat: add HeaderSearchBox component"
```

---

### Task 5: `CuisineCarouselRow` component

**Files:**
- Create: `components/CuisineCarouselRow.tsx`

**Interfaces:**
- Consumes: `RestaurantCard` from `components/RestaurantCard.tsx` (Task 1's fixed version) — same `{ restaurant, distanceKm }` props.
- Produces: `CuisineCarouselRow` — props `{ label: string; restaurants: { restaurant: Restaurant; distanceKm: number }[] }` where `Restaurant` is the same shape `RestaurantCard` already declares (`id, name, cuisine_tags, rating, avg_prep_minutes, is_open, banner_url`). `app/customer/page.tsx` (Task 6) is the only consumer.

- [ ] **Step 1: Write the component**

```tsx
import { RestaurantCard } from "./RestaurantCard";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  banner_url: string | null;
};

export function CuisineCarouselRow({
  label,
  restaurants,
}: {
  label: string;
  restaurants: { restaurant: Restaurant; distanceKm: number }[];
}) {
  if (restaurants.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-lg font-bold text-brand-ink">{label}</h2>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {restaurants.map(({ restaurant, distanceKm }) => (
          <div key={restaurant.id} className="w-64 shrink-0 snap-start">
            <RestaurantCard restaurant={restaurant} distanceKm={distanceKm} />
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/CuisineCarouselRow.tsx
git commit -m "feat: add CuisineCarouselRow component"
```

---

### Task 6: Wire cuisine-grouped carousel rows + search into `app/customer/page.tsx`

**Files:**
- Modify: `app/customer/page.tsx` (full file — see below)

**Interfaces:**
- Consumes: `CuisineCarouselRow` (Task 5) — `{ label, restaurants }`; `HeaderSearchBox`'s `value` state is lifted here so the header (Task 7) can render the input while this page owns filtering — see Task 7 for how the value crosses the layout boundary.
- Produces: nothing new consumed by later tasks — this is the home page itself.

This task addresses two Review Focus items: a restaurant with multiple `cuisine_tags` must appear in every matching row (iterate the full tags array when grouping, don't take `cuisine_tags[0]`), and cuisines with zero matching restaurants must be omitted, not rendered as an empty-heading row (`CuisineCarouselRow` already returns `null` on an empty list from Task 5, so the omission is enforced at the component level — this task must still avoid rendering a *wrapping* heading itself outside that component).

Because `HeaderSearchBox` needs to live in the header (`app/customer/layout.tsx`, a server-rendering wrapper around every customer page, not just this one) while its filtered results need to live on this page, and the spec scopes search to "client-side by name/cuisine text match, no new API" without requiring it to work identically across every customer route, this task keeps the search query in this page's own local state and does not lift it into the header — instead the header's `HeaderSearchBox` in Task 7 gets its own page-local instance for pages that want it wired up. For the home page specifically, wire the header's actual rendered search box via a small file-scoped module-level callback registered on mount — however, the simpler and spec-compliant approach is: **render the search box directly in the home page's own JSX above the carousel rows**, not inside `app/customer/layout.tsx`'s header, since the spec's header describes what DoorDash visually shows but the underlying data (restaurant list) only exists on the home page. Skip embedding `HeaderSearchBox` in the shared layout header; Task 7 renders the header's search slot as a static, unwired visual element matching DoorDash's placement (acceptable since the spec explicitly says the search box is "visual-only initially"), and this task wires up a second, functional `HeaderSearchBox` instance directly above the carousel rows on the home page where the data actually lives.

- [ ] **Step 1: Rewrite `app/customer/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAddress } from "@/lib/address-store";
import { haversineDistanceKm } from "@/lib/geo";
import { RestaurantCard } from "@/components/RestaurantCard";
import { HeroSearch } from "@/components/HeroSearch";
import { PromoBanner } from "@/components/PromoBanner";
import { CuisineChipRow } from "@/components/CuisineChipRow";
import { CuisineCarouselRow } from "@/components/CuisineCarouselRow";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  lat: number;
  lng: number;
  banner_url: string | null;
};

type Cuisine = {
  slug: string;
  label: string;
};

export default function CustomerHomePage() {
  const { lat, lng } = useAddress();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data, error: fetchError }, { data: cuisineData }] = await Promise.all([
        supabase
          .from("restaurants")
          .select("id, name, cuisine_tags, rating, avg_prep_minutes, is_open, lat, lng, banner_url")
          .eq("is_open", true)
          .eq("is_suspended", false),
        supabase.from("cuisine_taxonomy").select("slug, label").order("label"),
      ]);
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setRestaurants(data ?? []);
      setCuisines(cuisineData ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load restaurants: {error}</p>;
  }

  if (restaurants === null) {
    return <p className="text-brand-ink-muted">Loading restaurants…</p>;
  }

  const withDistance = restaurants
    .map((r) => ({ r, distanceKm: haversineDistanceKm(lat, lng, r.lat, r.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (r: Restaurant) =>
    query === "" ||
    r.name.toLowerCase().includes(query) ||
    r.cuisine_tags.some((tag) => tag.toLowerCase().includes(query));

  const searched = withDistance.filter(({ r }) => matchesQuery(r));

  const filtered = searched.filter(
    ({ r }) => selectedCuisine === null || r.cuisine_tags.includes(selectedCuisine)
  );

  // Group by cuisine for the carousel view. A restaurant with multiple
  // cuisine_tags appears once per matching tag it has, not just its first.
  const byCuisine = cuisines.map((c) => ({
    cuisine: c,
    restaurants: searched
      .filter(({ r }) => r.cuisine_tags.includes(c.slug))
      .map(({ r, distanceKm }) => ({ restaurant: r, distanceKm })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <HeroSearch />
      <PromoBanner message="Free delivery on your first order 🎉" />
      <HeaderSearchBox value={searchQuery} onChange={setSearchQuery} />
      <CuisineChipRow cuisines={cuisines} selected={selectedCuisine} onSelect={setSelectedCuisine} />
      <div id="restaurants" />
      {restaurants.length === 0 ? (
        <p className="text-brand-ink-muted">No open restaurants near you right now.</p>
      ) : selectedCuisine !== null ? (
        filtered.length === 0 ? (
          <p className="text-brand-ink-muted">No restaurants match that cuisine right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(({ r, distanceKm }) => (
              <RestaurantCard key={r.id} restaurant={r} distanceKm={distanceKm} />
            ))}
          </div>
        )
      ) : searched.length === 0 ? (
        <p className="text-brand-ink-muted">No restaurants match &quot;{searchQuery}&quot;.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {byCuisine.map(({ cuisine, restaurants: rows }) => (
            <CuisineCarouselRow key={cuisine.slug} label={cuisine.label} restaurants={rows} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 3: Manual verification**

Start the app (`npm run app:start` per `docs/DEPLOYMENT.md`, Docker Desktop + Supabase must already be running) and open `http://localhost:3000/customer`:
- Confirm one carousel row per cuisine with at least one open restaurant, no rows for cuisines with none.
- Type a restaurant name into the search box, confirm it filters both the "no chip selected" carousel view and updates correctly.
- Click a cuisine chip, confirm it collapses to the single flat grid (existing behavior) using the search-filtered set.
- Clear the search box, confirm all rows return.

- [ ] **Step 4: Commit**

```bash
git add app/customer/page.tsx
git commit -m "feat: cuisine-grouped carousel rows and search filter on customer home page"
```

---

### Task 7: Rebuild header + wire `SidebarNav` into `app/customer/layout.tsx`

**Files:**
- Modify: `app/customer/layout.tsx` (full file — see below)
- Modify: `components/AddressPicker.tsx:22` (remove outer border/padding only)

**Interfaces:**
- Consumes: `SidebarNav` (Task 2), `DeliveryPickupToggle` (Task 3), `CartPanel` (existing, unchanged), `AddressPicker` (existing, wrapper-only change).
- Produces: nothing new consumed by later tasks — this is the shared layout shell.

- [ ] **Step 1: Trim `AddressPicker`'s outer wrapper**

In `components/AddressPicker.tsx`, change line 22 from:

```tsx
    <div className="border-b border-gray-200 p-3">
```

to:

```tsx
    <div className="relative">
```

No other line in this file changes — every handler (`handleSave`, the `onClick` toggling `open`, the draft-state `useState` calls) stays exactly as-is.

- [ ] **Step 2: Rewrite `app/customer/layout.tsx`**

```tsx
import { ReactNode } from "react";
import Link from "next/link";
import { CartProvider } from "@/lib/cart-store";
import { AddressProvider } from "@/lib/address-store";
import { AddressPicker } from "@/components/AddressPicker";
import { CartConflictDialog } from "@/components/CartConflictDialog";
import { CartPanel } from "@/components/CartPanel";
import { SidebarNav } from "@/components/SidebarNav";
import { DeliveryPickupToggle } from "@/components/DeliveryPickupToggle";
import { BRAND } from "@/lib/branding";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <AddressProvider>
      <CartProvider>
        <CartConflictDialog />
        <div className="flex min-h-screen">
          <SidebarNav />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex flex-wrap items-center gap-3 border-b border-brand-ink-muted/10 bg-brand-surface px-4 py-3">
              <Link href="/customer" className="shrink-0 text-lg font-bold text-brand-primary">
                {BRAND.name}
              </Link>
              <AddressPicker />
              <DeliveryPickupToggle />
              <div className="ml-auto flex items-center gap-3">
                <Link href="/customer/login" className="text-sm font-medium text-brand-ink-muted">
                  Sign In
                </Link>
              </div>
            </header>
            <main className="mx-auto w-full max-w-5xl flex-1 p-4 pb-24">{children}</main>
          </div>
        </div>
        <CartPanel />
      </CartProvider>
    </AddressProvider>
  );
}
```

Notes on what changed from the previous layout and why:
- `max-w-3xl` → `max-w-5xl` on `<main>`: carousel rows and the wider header need more horizontal room than the old single-column layout; this is a presentation-only width change, no logic.
- The functional `HeaderSearchBox` is deliberately *not* placed here — Task 6 already renders a wired, functional search box directly on the home page where the restaurant data lives (see Task 6's rationale). Placing an unwired second search box in this shared header would either duplicate state awkwardly across every customer route or silently do nothing on non-home pages, both worse than the chosen approach. This satisfies the spec's "search box... visual-only initially" framing without a misleading no-op input in the header.
- `CartPanel` and `CartConflictDialog` keep their existing fixed/overlay positioning (`fixed bottom-0 left-0 right-0` etc., defined inside those components themselves, untouched) — moving them outside the flex row is intentional and correct, since both are already fixed-position overlays that shouldn't be affected by the new sidebar's flex column.

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

With the app running:
- Load `/customer` at desktop width: confirm sidebar renders on the left, "Home" highlighted.
- Navigate to a restaurant detail page: confirm "Restaurants" sidebar item is highlighted (prefix match).
- Resize/emulate to 390×844: confirm sidebar disappears (`hidden md:flex`), header wraps reasonably, `CartPanel`'s bottom bar (add an item to cart first) is not overlapped by anything.
- Click the address picker in the header: confirm the existing dropdown/save flow still works identically to before (manual lat/lng entry, save, label updates).
- Confirm "Pickup" in the toggle is visibly disabled and unclickable.

- [ ] **Step 5: Commit**

```bash
git add app/customer/layout.tsx components/AddressPicker.tsx
git commit -m "feat: rebuild customer header and add sidebar nav to layout"
```

---

### Task 8: Restaurant detail page density/polish pass

**Files:**
- Modify: `app/customer/restaurants/[id]/page.tsx:83,96,104` (spacing/typography classes only — no logic, no new state, no new fetch)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Apply spacing/typography changes**

In `app/customer/restaurants/[id]/page.tsx`, update only the class strings on the banner wrapper, heading, and menu-list wrapper to match the denser card/spacing style introduced by the carousel rows — no other lines change:

Change line 83 from:
```tsx
      <div className="relative mb-4 h-56 w-full overflow-hidden rounded-xl bg-brand-accent/10">
```
to:
```tsx
      <div className="relative mb-6 h-64 w-full overflow-hidden rounded-2xl bg-brand-accent/10 shadow-sm">
```

Change line 96 from:
```tsx
      <h1 className="mb-4 text-xl font-bold text-brand-ink">{restaurant.name}</h1>
```
to:
```tsx
      <h1 className="mb-1 text-2xl font-bold text-brand-ink">{restaurant.name}</h1>
      <p className="mb-4 text-sm text-brand-ink-muted">
        {restaurant.cuisine_tags.join(", ")} · ⭐ {restaurant.rating.toFixed(1)} · {restaurant.avg_prep_minutes} min
      </p>
```

Change line 104 from:
```tsx
      <div className="flex flex-col">
```
to:
```tsx
      <div className="flex flex-col divide-y divide-brand-ink-muted/10 rounded-xl border border-brand-ink-muted/10 bg-brand-surface">
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Load a restaurant detail page, confirm banner/heading/menu list render with the denser card treatment and no layout breakage, confirm menu item rows (from the existing unmodified `MenuItemRow` component) still show correctly inside the new bordered wrapper.

- [ ] **Step 4: Commit**

```bash
git add "app/customer/restaurants/[id]/page.tsx"
git commit -m "style: density and polish pass on restaurant detail page"
```

---

### Task 9: End-to-end live verification and whole-branch review

**Files:** none (verification-only task)

**Interfaces:** none.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds with zero errors/warnings introduced by this work.

- [ ] **Step 2: Playwright walkthrough — desktop**

Drive the running app (`npm run app:start`, Docker + Supabase already up) with Playwright:
- `/customer`: sidebar visible and correctly highlighted, header shows logo/address/toggle/sign-in, cuisine carousel rows render and scroll horizontally, search box filters correctly, cuisine chip still collapses to single grid.
- Click into a restaurant, confirm sidebar highlights "Restaurants", confirm detail page polish renders, add 2+ items to cart.
- Confirm `CartPanel` bottom bar still works (expand, adjust quantity, remove item).
- Click Checkout, confirm redirect to `/customer/login?redirectTo=/customer/checkout` still works (this is existing, unmodified auth-gate behavior — must be unchanged).
- Sign up/log in with a fresh test account, confirm redirect back to checkout with cart intact, complete checkout, confirm order confirmation page loads.

- [ ] **Step 3: Playwright walkthrough — mobile (390×844)**

Same flow at the mobile viewport Phase 8 used:
- Confirm sidebar is absent (not just visually hidden but not taking layout space).
- Confirm header wraps without horizontal overflow.
- Confirm `CartPanel`'s fixed bottom bar is fully usable and unobstructed.

- [ ] **Step 4: Grep check for `<a href>` regressions**

Run: `grep -rn "href=\"/" app/customer components/RestaurantCard.tsx components/SidebarNav.tsx components/CuisineCarouselRow.tsx components/HeaderSearchBox.tsx components/DeliveryPickupToggle.tsx | grep -v "next/link" | grep "<a "`
Expected: no output (confirms no raw `<a href>` was introduced; `Link href=` matches are fine and won't match `<a `).

- [ ] **Step 5: Update project memory docs**

Update `CLAUDE.md`, `MEMORY.md`, `README.md` per the project's standing "Update CLAUDE files" rule: record this as a new completed entry (DoorDash-layout rebuild — sidebar, header, carousel rows), note the `RestaurantCard` `<a href>` fix (correcting the earlier stale "no `<a href>` tags exist" note), and note the search box's home-page-only scope as a deliberate, documented decision (not a gap) if asked about later.

- [ ] **Step 6: Final commit**

```bash
git add CLAUDE.md MEMORY.md README.md
git commit -m "docs: record DoorDash-layout rebuild completion"
```
