# Fresh & Quick Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand to "Fresh & Quick" with a richer DoorDash-inspired
visual system across all four surfaces, expand the seed catalog to 18
restaurants with real Pexels photography, and fix + document the n8n
workflow JSON.

**Architecture:** Visual/content-only project. Two new Tailwind/branding
tokens files drive every surface's re-skin; 4 new presentational
components (no data-fetching of their own) plug into the existing
homepage/detail-page data flow unchanged; catalog expansion is pure SQL
seed data plus a one-off image-fetch script; n8n fixes are targeted JSON
edits. No schema/behavior changes except one pure-data migration adding 4
cuisine-taxonomy rows.

**Tech Stack:** Next.js App Router + TypeScript + Tailwind CSS, Supabase
Postgres (local, self-hosted), Pexels Search API (fetch-once pattern).

**Spec:** `docs/superpowers/specs/2026-09-25-fresh-and-quick-redesign-design.md`

## Global Constraints

- `restaurants.banner_url` already exists in the schema — no migration
  needed for it.
- `images.pexels.com` is already allow-listed in `next.config.ts` and
  `lib/image-url.ts` — no config change needed for image hosts.
- Any code touching money must stay integer-cents/paise — this plan
  doesn't touch money math, but menu-item price literals in seed SQL must
  still be whole numbers (paise-equivalent, matching the existing demo
  rows' style: `220`, `150`, not `220.50`).
- Run `npm run build` after every task that touches `.tsx`/`.ts` files.
- Never call the Pexels API at runtime from the app — only from the
  one-off `scripts/fetch-catalog-images.mjs` script, with URLs then
  hardcoded into `seed.sql`.
- Brand name/colors are never hardcoded in a component — always via
  `lib/branding.ts` or the Tailwind `@theme` tokens in `app/globals.css`.
- `npx supabase db reset` re-applies all migrations + `seed.sql` — run it
  after any seed/migration change to verify.

## Review Focus

- A restaurant with `banner_url IS NULL` must render a graceful
  placeholder in `RestaurantCard`, not a broken image or a Next.js
  image-optimization crash.
- Multi-cuisine-tag restaurants must appear under every matching cuisine
  chip, not just the first tag in the array.
- Re-skinned vendor/delivery/admin pages must keep every existing
  Phase-8 error-surfacing element visible after the Tailwind-class pass.
- The new cuisine-taxonomy migration's `on conflict do nothing` must not
  mask a genuine typo in a slug (verify all 4 new slugs against what the
  seed data's `cuisine_tags` arrays actually reference).
- The n8n JSON fixes must not change any node's `id`/wiring in a way that
  breaks the workflow's connections graph — only `typeVersion`,
  `parameters`, and the specific broken expressions change.

---

### Task 1: Branding tokens

**Files:**
- Modify: `lib/branding.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `BRAND.name = "Fresh & Quick"`, `BRAND.theme` with 6 keys
  (`primary`, `accent`, `background`, `surface`, `ink`, `inkMuted`);
  Tailwind tokens `--color-brand-primary`, `--color-brand-accent`,
  `--color-brand-bg`, `--color-brand-surface`, `--color-brand-ink`,
  `--color-brand-ink-muted`, usable as `bg-brand-bg`, `text-brand-ink`,
  etc. via Tailwind's `@theme inline` mechanism (same pattern as the
  existing `--color-brand-primary` already in this file).

- [ ] **Step 1: Update `lib/branding.ts`**

```typescript
export const BRAND = {
  name: "Fresh & Quick",
  theme: {
    primary: "#DC2626",
    accent: "#F97316",
    background: "#FFF8F0",
    surface: "#FFFFFF",
    ink: "#1F1B16",
    inkMuted: "#6B6153",
  },
} as const;
```

- [ ] **Step 2: Update `app/globals.css`'s `@theme inline` block**

Replace the existing two brand color lines with all six, keeping the
"keep in sync with lib/branding.ts" comment:

```css
  /* Keep in sync with lib/branding.ts's BRAND.theme values. */
  --color-brand-primary: #DC2626;
  --color-brand-accent: #F97316;
  --color-brand-bg: #FFF8F0;
  --color-brand-surface: #FFFFFF;
  --color-brand-ink: #1F1B16;
  --color-brand-ink-muted: #6B6151;
```

Also update `body`'s `background`/`color` to reference the new ink/bg
tokens instead of the generic `--background`/`--foreground` pair, so the
whole app picks up the warm palette by default:

```css
body {
  background: var(--color-brand-bg);
  color: var(--color-brand-ink);
  font-family: Arial, Helvetica, sans-serif;
}
```

Leave the existing `--background`/`--foreground` dark-mode media query
block as-is (unrelated to brand tokens, no dark-mode redesign in scope).

- [ ] **Step 3: Grep for any hardcoded "FoodHub" string outside `lib/branding.ts`**

Run: `grep -rn "FoodHub" app/ components/ lib/ --include="*.tsx" --include="*.ts"`
Expected: no matches (the project's branding-isolation rule means the
name should only ever be read from `BRAND.name`). If any are found,
replace them with `BRAND.name` (import from `@/lib/branding`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/branding.ts app/globals.css
git commit -m "feat: rebrand to Fresh & Quick with richer color system"
```

---

### Task 2: New shared components — CuisineChip, CuisineChipRow

**Files:**
- Create: `components/CuisineChip.tsx`
- Create: `components/CuisineChipRow.tsx`

**Interfaces:**
- Produces: `CuisineChip({ label, active, onClick }: { label: string;
  active: boolean; onClick: () => void })`. `CuisineChipRow({
  cuisines, selected, onSelect }: { cuisines: { slug: string; label:
  string }[]; selected: string | null; onSelect: (slug: string | null)
  => void })` — renders an "All" chip (selected when `selected === null`)
  plus one chip per cuisine.
- Consumes: nothing external — pure presentational, parent owns state.

- [ ] **Step 1: Write `CuisineChip.tsx`**

```typescript
export function CuisineChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-brand-primary bg-brand-primary text-white"
          : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Write `CuisineChipRow.tsx`**

```typescript
import { CuisineChip } from "./CuisineChip";

export function CuisineChipRow({
  cuisines,
  selected,
  onSelect,
}: {
  cuisines: { slug: string; label: string }[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <CuisineChip label="All" active={selected === null} onClick={() => onSelect(null)} />
      {cuisines.map((c) => (
        <CuisineChip
          key={c.slug}
          label={c.label}
          active={selected === c.slug}
          onClick={() => onSelect(c.slug)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: no errors (these components aren't wired into a page yet, so
this just confirms they type-check).

- [ ] **Step 4: Commit**

```bash
git add components/CuisineChip.tsx components/CuisineChipRow.tsx
git commit -m "feat: add CuisineChip and CuisineChipRow components"
```

---

### Task 3: New shared components — HeroSearch, PromoBanner

**Files:**
- Create: `components/HeroSearch.tsx`
- Create: `components/PromoBanner.tsx`
- Read first: `lib/address-store.tsx` and `components/AddressPicker.tsx`
  in full, to reuse the existing address state/UI rather than rebuilding
  it.

**Interfaces:**
- Produces: `HeroSearch()` — no props, reads/writes address state via the
  existing `useAddress()` hook from `lib/address-store.tsx` (confirm the
  exact hook name/shape from the file before using it — don't guess).
  `PromoBanner({ message }: { message: string })`.

- [ ] **Step 1: Read `lib/address-store.tsx` and `components/AddressPicker.tsx` in full**

Confirm the exact exported hook/component names and how the existing
homepage (`app/customer/page.tsx`) currently reads `lat`/`lng` from it
(`const { lat, lng } = useAddress();` per the file already read during
planning — confirm this still matches before building on it).

- [ ] **Step 2: Write `PromoBanner.tsx`**

```typescript
export function PromoBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-brand-accent/10 px-4 py-2 text-sm font-medium text-brand-ink">
      {message}
    </div>
  );
}
```

- [ ] **Step 3: Write `HeroSearch.tsx`**

Build a hero section with a headline (using `BRAND.name` from
`lib/branding.ts`), subtext, and the existing `AddressPicker` component
embedded in a visually prominent search-bar-styled wrapper. Do not
reimplement address logic — import and render the existing
`AddressPicker` component inside new wrapper markup/classes only. Example
shape (adjust to the real `AddressPicker` props found in Step 1):

```typescript
import { BRAND } from "@/lib/branding";
import { AddressPicker } from "./AddressPicker";

export function HeroSearch() {
  return (
    <section className="rounded-xl bg-brand-primary px-6 py-10 text-white">
      <h1 className="text-3xl font-bold">{BRAND.name}</h1>
      <p className="mt-2 text-white/90">Fresh food, delivered fast.</p>
      <div className="mt-4 rounded-lg bg-white p-2">
        <AddressPicker />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/HeroSearch.tsx components/PromoBanner.tsx
git commit -m "feat: add HeroSearch and PromoBanner components"
```

---

### Task 4: Restyle RestaurantCard and MenuItemRow

**Files:**
- Modify: `components/RestaurantCard.tsx`
- Modify: `components/MenuItemRow.tsx`
- Read first: both files in full as they exist today (already read
  during planning for `RestaurantCard`; re-read `MenuItemRow.tsx` before
  editing since its current props/shape weren't captured in the spec).

**Interfaces:**
- `RestaurantCard`'s props stay exactly `{ restaurant: Restaurant;
  distanceKm: number }` — same shape as today, only JSX/classes change,
  so `app/customer/page.tsx`'s existing usage needs no edit from this
  task.
- Add `banner_url: string | null` to the `Restaurant` type this
  component declares locally (it currently doesn't select/use it —
  Task 5 updates the homepage's Supabase `select` to include it).

- [ ] **Step 1: Read `components/MenuItemRow.tsx` in full**

Confirm its current props and JSX structure before editing.

- [ ] **Step 2: Rewrite `RestaurantCard.tsx`**

```typescript
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
    <a
      href={`/customer/restaurants/${restaurant.id}`}
      className="block overflow-hidden rounded-xl border border-brand-ink-muted/10 bg-brand-surface shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-40 w-full bg-brand-accent/10">
        {restaurant.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.banner_url}
            alt={restaurant.name}
            className="h-full w-full object-cover"
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
    </a>
  );
}
```

Check whether this repo already uses `next/image` elsewhere (it does —
confirmed via `next.config.ts`'s `images.remotePatterns`) — if
`MenuItemRow.tsx` or other components use `next/image` rather than a
plain `<img>`, match that existing convention instead of introducing a
plain `<img>` here (use `next/image`'s `Image` component with `fill` +
the parent's `relative` positioning already set up above).

- [ ] **Step 3: Restyle `MenuItemRow.tsx`**

Apply the same brand-token treatment (`bg-brand-surface`,
`text-brand-ink`, `text-brand-ink-muted`, `border-brand-ink-muted/10`,
rounded corners) and enlarge the item photo, keeping every existing prop,
click handler, and piece of logic (cart-add behavior, price display,
veg/non-veg indicator) completely unchanged — this is a class-only edit.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no errors. Note: `app/customer/page.tsx` still selects the old
column list without `banner_url`, so this will type-error against the
new `Restaurant` type in `RestaurantCard` until Task 5 updates the
select — if the build fails here specifically because of the missing
`banner_url` field, that's expected and gets fixed in Task 5, not this
task. If any *other* error appears, fix it before proceeding.

- [ ] **Step 5: Commit**

```bash
git add components/RestaurantCard.tsx components/MenuItemRow.tsx
git commit -m "feat: restyle RestaurantCard and MenuItemRow with photo-forward layout"
```

---

### Task 5: Customer homepage redesign

**Files:**
- Modify: `app/customer/page.tsx`

**Interfaces:**
- Consumes: `HeroSearch` (Task 3), `CuisineChipRow` (Task 2),
  `RestaurantCard` (Task 4, now requiring `banner_url` in its
  `Restaurant` type).

- [ ] **Step 1: Read the current full file again to get exact current line numbers**

(Already read once during planning — re-read since Task 4 may have
changed how `RestaurantCard`'s type is imported/used.)

- [ ] **Step 2: Update the Supabase select to include `banner_url` and fetch cuisines**

Add `banner_url` to the existing `.select(...)` column list. Add a
second fetch for `cuisine_taxonomy` (`slug, label`, ordered by `label`)
to populate `CuisineChipRow` — fetch this alongside the existing
restaurants fetch (same `useEffect`, a second `await`, or a
`Promise.all` — match whatever pattern is simplest given the existing
function shape).

- [ ] **Step 3: Add cuisine-filter state and wire `CuisineChipRow`**

```typescript
const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
```

Filter the `sorted` array (after the existing distance-sort) by
`selectedCuisine === null || r.cuisine_tags.includes(selectedCuisine)`
before rendering.

- [ ] **Step 4: Restructure the JSX**

Render `<HeroSearch />`, then a `<PromoBanner message="..." />` (any
short promotional line, e.g. "Free delivery on your first order"), then
`<CuisineChipRow cuisines={cuisines} selected={selectedCuisine}
onSelect={setSelectedCuisine} />`, then the restaurant grid as a
responsive CSS grid (`grid grid-cols-1 gap-4 sm:grid-cols-2
lg:grid-cols-3`) instead of the current `flex flex-col`. Preserve the
existing loading/error/empty-state returns (restyle their classes to the
brand tokens, keep their logic/conditions unchanged).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: no errors — this is the task that resolves Task 4's expected
`banner_url` type mismatch.

- [ ] **Step 6: Live-verify**

With Docker/Supabase running and `.env.local` set, `npm run dev`, load
`/customer`, confirm the hero/chips/grid render, cuisine filtering
narrows the grid (test with the existing single demo restaurant's tags
`['indian','fast_food']` — selecting "Indian" or "Fast Food" should keep
it visible, selecting any other cuisine should hide it), and no console
errors appear.

- [ ] **Step 7: Commit**

```bash
git add app/customer/page.tsx
git commit -m "feat: redesign customer homepage with hero, cuisine filter, and photo grid"
```

---

### Task 6: Restaurant detail page banner

**Files:**
- Modify: `app/customer/restaurants/[id]/page.tsx`

**Interfaces:** none new — internal to this file.

- [ ] **Step 1: Read the current full file**

(Already read `is_open`/`is_suspended` portions during the prior triage
session — re-read in full now, since this task adds to that same query.)

- [ ] **Step 2: Add `banner_url` to the restaurant query's select list**

Same column addition pattern as Task 5.

- [ ] **Step 3: Render a banner**

Add a banner image/placeholder block at the top of the page (same
image-or-placeholder pattern as `RestaurantCard`, but full-width and
taller, e.g. `h-56`), above the existing closed/suspended banner and
menu list. Keep the closed/suspended banner and menu-list logic
completely unchanged — this task only adds the new image block above
them.

- [ ] **Step 4: Build**

Run: `npm run build`

- [ ] **Step 5: Live-verify**

Load a restaurant detail page in a real browser, confirm the banner
renders (or the placeholder, since the single demo restaurant has no
`banner_url` yet until Task 9's catalog expansion), and that the
existing closed/suspended banner still appears correctly when tested via
admin suspend (same check as the prior triage session's Task 8).

- [ ] **Step 6: Commit**

```bash
git add "app/customer/restaurants/[id]/page.tsx"
git commit -m "feat: add restaurant banner image to detail page"
```

---

### Task 7: Vendor and delivery surface re-skin

**Files:**
- Modify: `app/vendor/dashboard/page.tsx`
- Modify: `app/vendor/menu/page.tsx`
- Modify: `app/vendor/orders/page.tsx`
- Modify: `app/delivery/dashboard/page.tsx`

**Interfaces:** none — pure Tailwind class changes, zero logic edits.

- [ ] **Step 1: Read all four files in full**

These have each been touched by 3-5 prior tasks across the last triage
session — read their CURRENT state, not any earlier description.

- [ ] **Step 2: Apply brand tokens to each file**

For every hardcoded Tailwind gray/blue/red utility class (backgrounds,
borders, text colors, the primary action button colors currently using
`bg-brand-primary` already in some spots), replace with the appropriate
brand token: page background → `bg-brand-bg` (or leave inheriting from
`body` if the page doesn't set its own background), cards/panels →
`bg-brand-surface` with `border-brand-ink-muted/10`, primary text →
`text-brand-ink`, secondary/muted text → `text-brand-ink-muted`, primary
buttons → `bg-brand-primary text-white`, secondary buttons → border/
outline style using `border-brand-ink-muted/20`. Increase card/button
border-radius slightly (`rounded-lg` → `rounded-xl` where cards are
involved) for a softer, more DoorDash-like feel. Do not change any
function, state variable, fetch call, conditional, or JSX element
structure — only `className` string contents.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: no errors (pure class changes can't break TypeScript, but
confirm nothing was accidentally deleted).

- [ ] **Step 4: Live-verify**

Visit `/vendor/dashboard`, `/vendor/menu`, `/vendor/orders`, and
`/delivery/dashboard` in a real browser as their respective seeded/test
accounts. Confirm every existing control (open/close toggle, menu edit
form, order status buttons, claim/advance buttons, error messages) is
still visible and functional — visually different, behaviorally
identical. Spot-check that Phase-8's error-surfacing text is still
present (e.g. trigger an invalid action and confirm the error message
still renders, just restyled).

- [ ] **Step 5: Commit**

```bash
git add app/vendor/dashboard/page.tsx app/vendor/menu/page.tsx app/vendor/orders/page.tsx app/delivery/dashboard/page.tsx
git commit -m "style: apply Fresh & Quick brand tokens to vendor and delivery pages"
```

---

### Task 8: Admin surface and login pages re-skin

**Files:**
- Modify: `app/admin/dashboard/page.tsx`
- Modify: `app/customer/login/page.tsx`
- Modify: `app/vendor/login/page.tsx`
- Modify: `app/delivery/login/page.tsx`
- Modify: `app/admin/login/page.tsx`

**Interfaces:** none — pure Tailwind class changes, zero logic edits.

- [ ] **Step 1: Read all five files in full**

`app/customer/login/page.tsx` in particular is the security-reviewed
redirect-safe reference implementation (per CLAUDE.md) — confirm its
exact current classes before touching anything, and do not alter its
JS/TS logic (the `new URL(...)` redirect-validation code) under any
circumstances, only its `className` strings.

- [ ] **Step 2: Apply the same brand-token treatment as Task 7**

Same rules: backgrounds, borders, text colors, buttons, border-radius —
class-only changes, no logic/structure edits. Login/signup forms should
feel like one consistent visual family with the rest of the app (form
inputs get `border-brand-ink-muted/20 focus:border-brand-primary`
styling, submit buttons `bg-brand-primary text-white`).

- [ ] **Step 3: Build**

Run: `npm run build`

- [ ] **Step 4: Live-verify**

Load each of the 5 pages, confirm they render and every existing form
still submits/validates/redirects correctly (log in as each of the 4
roles at least once). This is the one re-skin task touching
security-sensitive code adjacency (the login redirect logic) — the live
check must confirm login still actually works for all 4 roles, not just
that the page renders.

- [ ] **Step 5: Commit**

```bash
git add app/admin/dashboard/page.tsx app/customer/login/page.tsx app/vendor/login/page.tsx app/delivery/login/page.tsx app/admin/login/page.tsx
git commit -m "style: apply Fresh & Quick brand tokens to admin dashboard and all login pages"
```

---

### Task 9: Cuisine taxonomy expansion migration

**Files:**
- Create: `supabase/migrations/00000000000014_expand_cuisine_taxonomy.sql`

**Interfaces:**
- Produces: 4 new `cuisine_taxonomy` rows (`mexican`, `thai`, `bakery`,
  `healthy`), consumed by Task 10's seed data.

- [ ] **Step 1: Check the next free migration number**

Run: `ls supabase/migrations/` — confirm `00000000000014` is free (no
prior task in this plan adds a migration before this one, but verify
since the file numbering must not collide).

- [ ] **Step 2: Write the migration, matching migration 4's exact style**

```sql
-- Expands the cuisine taxonomy for the Fresh & Quick catalog redesign.
-- Same pattern as migration 4 (fixed reference data, on conflict do
-- nothing, safe to re-run).
insert into public.cuisine_taxonomy (slug, label) values
  ('mexican', 'Mexican'),
  ('thai', 'Thai'),
  ('bakery', 'Bakery'),
  ('healthy', 'Healthy')
on conflict (slug) do nothing;
```

- [ ] **Step 3: Apply and verify**

Run: `npx supabase db reset`
Then: `select slug, label from public.cuisine_taxonomy order by slug;`
Expected: 12 rows total (8 existing + 4 new).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00000000000014_expand_cuisine_taxonomy.sql
git commit -m "feat: add mexican, thai, bakery, healthy to cuisine taxonomy"
```

---

### Task 10: Catalog expansion — image sourcing script

**Files:**
- Create: `scripts/fetch-catalog-images.mjs`

**Interfaces:**
- Produces: a script that, when run with `PEXELS_API_KEY` set in
  `.env.local`, prints a list of `(description, url)` pairs to stdout for
  hand-assembly into `seed.sql` in Task 11. Not part of the app's build
  or runtime — a one-off local tool, matching `scripts/`'s existing
  pattern (Node `.mjs`, no new dependency).

- [ ] **Step 1: Write the script**

```javascript
// One-off tool: queries the Pexels Search API for restaurant-banner and
// food-dish photos, printing URLs to hand-assemble into supabase/seed.sql.
// Never called at runtime by the app itself — matches the project's
// "fetch once, bake into seed.sql" rule (see MEMORY.md's Phase 2 note).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error(".env.local not found. Add PEXELS_API_KEY=<key> to it first.");
  process.exit(1);
}
const envText = readFileSync(envPath, "utf8");
const match = envText.match(/^PEXELS_API_KEY=(.+)$/m);
const apiKey = match?.[1]?.trim();
if (!apiKey) {
  console.error("PEXELS_API_KEY not set in .env.local.");
  process.exit(1);
}

const queries = process.argv.slice(2);
if (queries.length === 0) {
  console.error("Usage: node scripts/fetch-catalog-images.mjs \"query one\" \"query two\" ...");
  process.exit(1);
}

for (const query of queries) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    console.error(`Query "${query}" failed: ${res.status}`);
    continue;
  }
  const body = await res.json();
  console.log(`\n# ${query}`);
  for (const photo of body.photos ?? []) {
    console.log(`${photo.src.large}`);
  }
}
```

- [ ] **Step 2: Run it for restaurant-banner-style queries**

Run: `node scripts/fetch-catalog-images.mjs "indian restaurant food" "north indian thali" "south indian dosa" "chinese restaurant food" "italian pasta restaurant" "fast food burger" "dessert cafe" "juice bar beverages" "mexican tacos restaurant" "thai food restaurant" "bakery bread pastries" "healthy salad bowl restaurant"`

Capture the printed URLs — these become the 18 restaurants'
`banner_url` values in Task 11 (pick one URL per cuisine query,
reusing/varying across the 18 restaurants as needed since Pexels has a
limited result set per query).

- [ ] **Step 3: Run it for individual dish-style queries**

Run a second pass with more specific dish names for menu-item photos
(e.g. `"butter chicken"`, `"veg biryani"`, `"chicken tikka"`, `"idli
sambar"`, `"masala dosa"`, `"kung pao chicken"`, `"hakka noodles"`,
`"margherita pizza"`, `"pasta alfredo"`, `"cheeseburger"`, `"french
fries"`, `"chocolate cake"`, `"gulab jamun"`, `"mango lassi"`, `"iced
coffee"`, `"beef tacos"`, `"pad thai"`, `"croissant"`, `"sourdough
bread"`, `"quinoa salad bowl"`, `"grilled chicken salad"` — adjust the
exact list to whatever's needed once you know the final 18-restaurant
menu, decided while writing Task 11's seed data) — as many queries as
needed to cover the ~60-90 planned menu items, batching multiple queries
per script invocation (the script already accepts multiple `argv`
queries in one run).

- [ ] **Step 4: Commit the script**

```bash
git add scripts/fetch-catalog-images.mjs
git commit -m "feat: add one-off Pexels image-sourcing script for catalog expansion"
```

(Commit the script itself now; the fetched URLs feed directly into
Task 11's seed data, not into a separate commit.)

---

### Task 11: Catalog expansion — seed data

**Files:**
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: image URLs from Task 10's script output.

- [ ] **Step 1: Read the current full `supabase/seed.sql`**

(Already read the restaurant/menu-item section during planning — re-read
the full file, including the admin-account `do $$ ... end $$` block at
the bottom, to know exactly what to preserve unchanged.)

- [ ] **Step 2: Write 17 additional restaurants + demo vendor owner rows**

Each new restaurant needs its own `users` (role `vendor`), `addresses`,
and `restaurants` row (mirroring the existing demo vendor pattern
exactly — fixed UUIDs, `on conflict do nothing`), spread across a small
lat/lng radius around the existing demo coordinates (19.0760, 72.8777)
— e.g. ±0.02-0.05 degrees per restaurant, enough for the homepage's
existing distance-sort to produce a visibly varied order. Cover the
cuisine spread from the spec: 2× indian, 1× north_indian, 1×
south_indian, 2× chinese, 2× italian, 2× fast_food, 1× desserts, 1×
beverages, 2× mexican, 1× thai, 1× bakery, 2× healthy (18 total
including the existing "Demo Kitchen"). Give each a plausible name,
1-2 cuisine tags matching its category, `is_open = true`,
`avg_prep_minutes` between 20-40, `rating` between 3.8-4.8, and a
`banner_url` from Task 10's fetched URLs (or `null` for at most 1-2 of
them, to genuinely exercise the placeholder path called out in Review
Focus — don't leave every single row with a real image).

- [ ] **Step 3: Write 3-5 menu items per new restaurant**

Each `menu_items` row needs a fixed UUID, `restaurant_id` matching its
parent, a plausible name/description matching the restaurant's cuisine,
an integer price (100-450 range, matching the existing demo data's
style), a `category` (`"Main Course"`, `"Starter"`, `"Dessert"`,
`"Beverage"`, etc.), `is_veg` boolean, `is_available = true`, and an
`image_url` from Task 10's fetched dish photos.

- [ ] **Step 4: Verify no UUID collisions**

The existing demo data uses UUIDs like
`33333333-3333-3333-3333-333333333333`. Use a clearly distinct pattern
for the new rows (e.g. incrementing hex prefixes `a1111111-...`,
`a2222222-...` per restaurant) to avoid any chance of collision with the
existing fixed demo UUIDs or with each other.

- [ ] **Step 5: Apply and verify**

Run: `npx supabase db reset`
Then: `select count(*) from public.restaurants;` (expect 18) and
`select count(*) from public.menu_items;` (expect the existing 2 plus
this task's ~60-90, so roughly 62-92).

- [ ] **Step 6: Live-verify**

Load `/customer` in a real browser, confirm 18 restaurants render with
images (or the placeholder for the deliberate null-banner rows), cuisine
filtering works across the full new set (test at least 3 different
cuisine chips), and clicking into 2-3 different restaurants shows their
menu items with images correctly.

- [ ] **Step 7: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: expand seed catalog to 18 restaurants across 12 cuisines with Pexels imagery"
```

---

### Task 12: n8n workflow JSON fixes

**Files:**
- Modify: all 5 files in `n8n/workflows/`
- Read first: `docs/n8n-webhook-setup.md` and MEMORY.md's Phase 7 entry
  in full for the exact list of known issues before editing.

**Interfaces:** none — these are n8n import artifacts, not consumed by
this app's code.

- [ ] **Step 1: Read all 5 workflow JSON files in full**

List them first: `ls n8n/workflows/`. Read each completely before
editing any of them.

- [ ] **Step 2: Fix the `IF` node `typeVersion` mismatch**

For every `IF` node declared with `"typeVersion": 2` whose `parameters`
block uses v1's shape (a `conditions` object with `boolean`/`number`/
`string` sub-arrays, rather than v2's single `conditions` array with a
`combinator` field), change the declared `"typeVersion"` to `1` to match
the parameters actually present, rather than rewriting the parameters to
v2's shape — the smaller, safer fix per the spec.

- [ ] **Step 3: Fix workflow 02's decision-node API mismatch**

Find the node using `$input.item.json` in workflow 02. Check its
declared `"type"` field: if it's `"n8n-nodes-base.function"` (the legacy
Function node) using `$input.item.json` (which is actually the *modern*
Code-node API, not the legacy Function node's `items[0].json` style),
change `"type"` to `"n8n-nodes-base.code"` and bump `"typeVersion"` to
match a current Code node (check the other Code/Function-style nodes
already in this workflow file, if any, for the version number they use;
otherwise use `2`).

- [ ] **Step 4: Fix workflow 04's array-indexing issue**

Find the expression referencing `$json[0]` after an HTTP Request node.
Change it to reference `$json` directly (drop the `[0]` indexing),
since HTTP Request node v4 already splits a JSON array response into one
n8n item per array element.

- [ ] **Step 5: Add an empty-candidates guard to workflow 04**

Before the node that POSTs the assignment, insert an `IF` node checking
whether the candidates array/list has at least one entry (use the same
`typeVersion`/parameter shape as the other correctly-versioned `IF`
nodes in this same file, for consistency). Route the "false" branch to a
no-op or a `NoOp`/`Set` node that does nothing further, rather than
letting an empty-candidates case reach the assign POST.

- [ ] **Step 6: Add `webhookId` to every webhook node**

For every node with `"type": "n8n-nodes-base.webhook"` missing a
`"webhookId"` field, add one — a random-looking UUID string is
sufficient (n8n regenerates it on import anyway if it doesn't match, but
this avoids the "may regenerate" caveat currently in MEMORY.md).

- [ ] **Step 7: Validate JSON syntax**

Run: `node -e "for (const f of require('fs').readdirSync('n8n/workflows')) { JSON.parse(require('fs').readFileSync('n8n/workflows/' + f, 'utf8')); console.log(f, 'OK'); }"`
Expected: all 5 files print "OK" with no parse errors.

- [ ] **Step 8: Commit**

```bash
git add n8n/workflows/
git commit -m "fix: correct IF node versions, decision-node type, array indexing, and add empty-candidates guard + webhookId in n8n workflows"
```

---

### Task 13: n8n setup guide rewrite

**Files:**
- Modify: `docs/n8n-webhook-setup.md`

**Interfaces:** none.

- [ ] **Step 1: Read the current file in full**

- [ ] **Step 2: Rewrite as a full walkthrough**

Cover, in order: (1) prerequisites — an n8n instance (Docker or n8n
cloud), reachable network path to this app's `/api/internal/*` routes;
(2) importing each of the 5 workflow JSON files (n8n's Import from File
flow); (3) where to configure the shared secret — n8n needs a credential
or a `Set`/header value matching this app's `N8N_INTERNAL_SECRET` from
`.env.local`, sent as the `X-Internal-Secret` header on every call into
`/api/internal/*` (per `lib/internal-auth.ts`'s existing constant-time
comparison — reference this file, don't restate its logic); (4)
configuring the app's base URL in each workflow's HTTP Request nodes
(likely `http://host.docker.internal:3000` if n8n runs in Docker
alongside a locally-running Next.js dev/prod server — call this out
explicitly since it's a common local-Docker-networking gotcha); (5)
activation order (which workflows, if any, depend on another being
active first — check the 5 workflows' trigger types to determine this,
don't assume); (6) a "how to test each workflow" section — for each of
the 5, what real action in the app (or what manual webhook trigger) fires
it, and what the expected downstream effect is (e.g. a payment record's
status changing, an order being auto-assigned).

Keep the existing explicit framing that this is **reviewed but not run
against a live instance** — this task fixed known bugs and added a
proper walkthrough, but nothing here has been executed against real n8n,
and the doc must say so plainly, not imply otherwise.

- [ ] **Step 3: Commit**

```bash
git add docs/n8n-webhook-setup.md
git commit -m "docs: rewrite n8n setup guide as a full walkthrough after fixing known workflow bugs"
```

---

### Task 14: Update project memory docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `MEMORY.md`
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Update `CLAUDE.md`**

Update the "What this is" section's brand name reference if any (check
for "FoodHub" mentions), and add a line noting the visual system now
lives across `lib/branding.ts` + `app/globals.css`'s `@theme` block (6
tokens, not 2).

- [ ] **Step 2: Update `MEMORY.md`**

Add a new phase-log entry (after the deferred-items-triage entry)
documenting this redesign: rebrand to Fresh & Quick, richer color
system, DoorDash-inspired homepage/detail-page layout, all-surface
re-skin, 18-restaurant catalog expansion with Pexels imagery, and the
n8n JSON fixes + guide rewrite — matching the level of detail every
other phase entry in this file already has (bugs found, decisions made,
if any came up during implementation).

- [ ] **Step 3: Update `README.md`**

Update the customer/vendor/delivery/admin flow descriptions if any
specific UI language changed (e.g. "no in-product open toggle" was
already fixed in the prior triage — this task is unlikely to need
README changes beyond the brand name/visual mentions, but check).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md MEMORY.md README.md
git commit -m "docs: update project memory docs for Fresh & Quick redesign"
```
