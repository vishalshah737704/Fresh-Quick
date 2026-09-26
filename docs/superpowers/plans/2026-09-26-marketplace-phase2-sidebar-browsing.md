# Marketplace Phase 2 — Sidebar & Category Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the customer sidebar's 4 food-app items with an
Uber-Eats-style icon list covering all 11 store categories (Restaurants +
the 10 new ones), and make the home feed filterable by `category_type`.
Ships before any non-restaurant content exists — categories with zero
stores show a category-appropriate empty state, not an error, so this
phase is independently testable without waiting on Phases 3-5.

**Architecture:** A new static `lib/category-icons.ts` maps each
`category_type` value to a display label and a Pexels-sourced icon image
URL (fetched once, hardcoded — same pattern as existing menu/store
photography). `SidebarNav` renders one link per category to
`/customer?category=<type>`. The home page reads that query param,
filters the existing store grid by `category_type` (client-side, same
approach the cuisine chips already use), and shows an empty state
("No <category> stores yet — check back soon!") for a category with zero
open stores rather than an error.

**Tech Stack:** Next.js App Router (TypeScript), Tailwind (existing
`brand-*` tokens from `lib/branding.ts` — do not introduce Uber Eats'
green/black palette), Pexels Search API (`scripts/fetch-catalog-images.mjs`,
already exists, reuse as-is), Supabase (`stores.category_type`, already
in the schema since Phase 1).

**Spec:** `docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md`
(section 5, section 7 phase 2)

## Global Constraints

- **Brand discipline**: use existing `brand-primary`/`brand-accent`/etc.
  Tailwind tokens throughout. Do not hardcode a new color, and do not use
  Uber Eats' actual palette — this is a layout/structure match, not a
  visual clone (per the spec's explicit brand-vs-clone ruling).
- **Zero backend/schema change**: `category_type` already exists and is
  fully populated (Phase 1). This phase is UI-only.
- **A category with zero stores must render a clean empty state, never a
  crash or a blank white screen** — every content phase after this one
  lands independently, so this state will be real and visible in
  production between Phase 2 landing and Phase 3 landing.
- **`/customer/restaurants/[id]` redirect (Phase 1) and `/customer/stores/[id]`
  canonical route stay as-is** — this phase does not touch store-detail
  routing, only the browse/filter surface.

## Review Focus

- **A category param with no matching stores** (`?category=pet` before
  Phase 5 seeds any pet stores) must show the empty state, not throw or
  render `undefined`.
- **An unknown/malformed `category` query value** (someone hand-edits the
  URL to `?category=nonsense`) should fall back to showing all stores or
  a clean "unknown category" state — not crash the page.
- **The active-state highlighting** for the currently-selected category in
  the sidebar must work for every one of the 11 items, not just the ones
  visually tested first.
- **Existing cuisine-chip filtering** (restaurant-only, from the original
  build) must keep working unmodified when `category=restaurant` — this
  phase adds a new filter dimension on top of it, not a replacement.
- **The old `/customer#restaurants` anchor scroll link** (kept working
  during Phase 1's own fix loop) must still work after the sidebar's
  restructure — don't reintroduce that regression.

---

## Task 1: Category icon assets

**Files:**
- Create: `lib/category-icons.ts`

**Interfaces:**
- Produces: `CATEGORY_ICONS: Record<CategoryType, { label: string; icon: string }>`
  where `CategoryType` is the same 11-value union as the DB's
  `category_type` check constraint (`'restaurant' | 'grocery' | 'convenience'
  | 'alcohol' | 'health' | 'retail' | 'pet' | 'flowers' | 'baby' |
  'personal_care' | 'electronics'`), and `icon` is a Pexels image URL.

- [ ] **Step 1: Fetch one representative icon photo per category**

Run (requires `PEXELS_API_KEY` in `.env.local`, already present):
```bash
node scripts/fetch-catalog-images.mjs "restaurant food" "grocery store" "convenience store" "wine bottles" "vitamins pharmacy" "retail shopping" "pet supplies" "flower bouquet" "baby products" "cosmetics skincare" "electronics gadgets"
```
Pick the first `large` URL printed under each query's heading (they come
back as `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?...`
— reuse the exact URL, don't rewrite it).

- [ ] **Step 2: Write `lib/category-icons.ts`**

```typescript
export type CategoryType =
  | "restaurant"
  | "grocery"
  | "convenience"
  | "alcohol"
  | "health"
  | "retail"
  | "pet"
  | "flowers"
  | "baby"
  | "personal_care"
  | "electronics";

export const CATEGORY_ICONS: Record<CategoryType, { label: string; icon: string }> = {
  restaurant: { label: "Restaurants", icon: "<paste the restaurant food URL from Step 1>" },
  grocery: { label: "Grocery", icon: "<paste the grocery store URL>" },
  convenience: { label: "Convenience", icon: "<paste the convenience store URL>" },
  alcohol: { label: "Alcohol", icon: "<paste the wine bottles URL>" },
  health: { label: "Health", icon: "<paste the vitamins pharmacy URL>" },
  retail: { label: "Retail", icon: "<paste the retail shopping URL>" },
  pet: { label: "Pet", icon: "<paste the pet supplies URL>" },
  flowers: { label: "Flowers", icon: "<paste the flower bouquet URL>" },
  baby: { label: "Baby", icon: "<paste the baby products URL>" },
  personal_care: { label: "Personal Care", icon: "<paste the cosmetics skincare URL>" },
  electronics: { label: "Electronics", icon: "<paste the electronics gadgets URL>" },
};

export const CATEGORY_ORDER: CategoryType[] = [
  "restaurant", "grocery", "convenience", "alcohol", "health", "retail",
  "pet", "flowers", "baby", "personal_care", "electronics",
];
```
Replace every `<paste ... URL>` placeholder with a REAL URL from Step 1's
output before committing — this file must contain zero placeholder text
when done.

- [ ] **Step 3: Commit**

```bash
git add lib/category-icons.ts
git commit -m "feat: add category icon constants for sidebar/browsing"
```

---

## Task 2: Sidebar rebuild

**Files:**
- Modify: `components/SidebarNav.tsx`

**Interfaces:**
- Consumes: `CATEGORY_ICONS`, `CATEGORY_ORDER` from Task 1.
- Produces: sidebar links to `/customer?category=<type>` for each
  category, `/customer` (Home), `/customer/login` (Orders/Account,
  unchanged from today).

- [ ] **Step 1: Replace the `ITEMS` array with a category-driven list**

```typescript
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { CATEGORY_ICONS, CATEGORY_ORDER } from "@/lib/category-icons";

const STATIC_ITEMS_TOP = [
  { href: "/customer", label: "Home", icon: "🏠" as const },
];
const STATIC_ITEMS_BOTTOM = [
  { href: "/customer/login", label: "Orders", icon: "🧾" as const },
  { href: "/customer/login", label: "Account", icon: "👤" as const },
];

export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");

  return (
    <nav className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-brand-ink-muted/10 bg-brand-surface p-4 md:flex">
      {STATIC_ITEMS_TOP.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
            pathname === "/customer" && !activeCategory
              ? "bg-brand-primary/10 text-brand-primary"
              : "text-brand-ink-muted hover:bg-brand-accent/10"
          }`}
        >
          <span className="text-lg">{item.icon}</span>
          {item.label}
        </Link>
      ))}
      {CATEGORY_ORDER.map((category) => {
        const { label, icon } = CATEGORY_ICONS[category];
        const active = pathname === "/customer" && activeCategory === category;
        return (
          <Link
            key={category}
            href={`/customer?category=${category}`}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              active
                ? "bg-brand-primary/10 text-brand-primary"
                : "text-brand-ink-muted hover:bg-brand-accent/10"
            }`}
          >
            <Image
              src={icon}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 shrink-0 rounded-full object-cover"
            />
            {label}
          </Link>
        );
      })}
      {STATIC_ITEMS_BOTTOM.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
            pathname.startsWith(item.label === "Orders" ? "/customer/orders" : "/customer/login")
              ? "bg-brand-primary/10 text-brand-primary"
              : "text-brand-ink-muted hover:bg-brand-accent/10"
          }`}
        >
          <span className="text-lg">{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
```

Check `next.config.ts`/`next.config.js` for an `images.remotePatterns` (or
`domains`) entry allowing `images.pexels.com` — if missing, add it (the
existing menu/restaurant photos already use Pexels URLs via plain `<img>`
tags in other components, so check whether this codebase already allows
Pexels through `next/image` or whether those other components
deliberately use a plain `<img>` tag instead of `next/image` to avoid this
config requirement; match whichever pattern is already established rather
than introducing a second one).

- [ ] **Step 2: Build check**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add components/SidebarNav.tsx next.config.ts
git commit -m "feat: rebuild sidebar with all 11 store categories"
```

(Omit `next.config.ts` from the add if Task 2 Step 1's investigation found
no config change was needed.)

---

## Task 3: Home feed category filtering

**Files:**
- Modify: `app/customer/page.tsx`

**Interfaces:**
- Consumes: `useSearchParams()`'s `category` param (set by Task 2's
  sidebar links).
- Produces: the store grid filtered to `category_type === category` when
  the param is present; unfiltered (today's behavior) when absent.

- [ ] **Step 1: Read the `category` query param and filter**

In the client component, add:
```typescript
import { useSearchParams } from "next/navigation";
// ...
const searchParams = useSearchParams();
const categoryParam = searchParams.get("category");
```

The existing `stores` fetch already selects `category_type` is NOT
currently in its `.select(...)` string (it was added to the `stores`
table in Phase 1 but this page's select list predates that) — add
`category_type` to the select string first.

Then, wherever the page currently derives its filtered/sorted list (the
`withDistance`/`sortedFiltered`-style pipeline), add a filter step: when
`categoryParam` is set and is one of the 11 known category values, keep
only stores whose `category_type === categoryParam`; when it's absent,
keep all (today's behavior, unchanged). An unrecognized `categoryParam`
value (not one of the 11) should behave the same as "absent" (show
everything) rather than showing zero results or crashing — validate it
against `CATEGORY_ORDER` from `lib/category-icons.ts` (Task 1) before
using it as a filter.

- [ ] **Step 2: Category-aware empty state**

When `categoryParam` is a valid category and the filtered list is empty,
render (instead of the generic "No open restaurants near you right now."
message):
```tsx
<p className="text-brand-ink-muted">
  No {CATEGORY_ICONS[categoryParam as CategoryType].label.toLowerCase()} stores yet — check back soon!
</p>
```
Keep the existing generic empty-state message for the no-filter case
unchanged.

- [ ] **Step 3: Cuisine chips stay restaurant-scoped**

The existing `CuisineChipRow` must only render/apply when
`categoryParam === "restaurant"` or `categoryParam` is absent (today's
default view mixes categories, so cuisine chips only make sense once
you're either looking at everything or specifically at restaurants) —
when browsing e.g. `?category=grocery`, hide the cuisine chip row
entirely rather than showing irrelevant cuisine filters. Read the current
render logic before editing so this fits naturally rather than as a
bolted-on conditional.

- [ ] **Step 4: Build check + live verify**

```bash
npm run build
npx supabase db reset
npm run dev &
sleep 5
```
Load `http://localhost:3000/customer` (no category — see all 17 seeded
restaurants as today), then `http://localhost:3000/customer?category=grocery`
(no grocery stores exist yet — confirm the new empty state renders, not
an error), then `http://localhost:3000/customer?category=restaurant`
(confirm identical results to the no-param view, since `category_type`
is `'restaurant'` for all seeded stores today), then
`http://localhost:3000/customer?category=nonsense` (confirm it falls back
to showing everything, per Step 1's validation).

- [ ] **Step 5: Commit**

```bash
git add app/customer/page.tsx
git commit -m "feat: filter customer home feed by store category"
```

---

## Task 4: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Full smoke test**

With a reset DB and dev server running, click through: sidebar → each of
the 11 category links → confirm restaurant shows real stores, every
other category shows the empty state cleanly, no console errors. Click
Home → confirm unfiltered view restored. Confirm the existing checkout
flow (place an order against a seeded restaurant) still works unaffected
by this phase's changes — this phase doesn't touch checkout, but is the
final check that nothing regressed.

- [ ] **Step 2: Update MEMORY.md**

Add an entry: Phase 2 (Sidebar & Category Browsing) complete — all 11
categories in the sidebar with Pexels icons, home feed filterable by
`category_type`, empty state for categories with no stores yet. Note
Phases 3-5 (real seeded content per category) are the next follow-ons.

- [ ] **Step 3: Commit**

```bash
git add MEMORY.md
git commit -m "docs: record phase 2 sidebar/category-browsing completion"
```
