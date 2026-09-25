# Phase 2 — Customer Browse + Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer can open the app anonymously (no login), see a restaurant
list sorted by distance from a picked address, view a restaurant's menu, add
items to a single-restaurant cart (switching restaurants prompts to clear the
cart first), and see the cart's contents/subtotal — all against the Phase 1
Supabase schema and seed data.

**Architecture:** Client-side React (Next.js App Router, `"use client"`
components) reading directly from the Supabase anon client (RLS already
allows public reads of restaurants/menu_items from Phase 1). Cart state lives
in a React Context backed by `localStorage` so it survives a page reload.
Address picking is a manual lat/lng entry stub (Google Maps API key not yet
available — swappable later without changing the cart/restaurant-list code
that consumes the picked address).

**Tech Stack:** Next.js App Router client components, React Context (no new
state-management dependency — YAGNI for a single cart), `@supabase/supabase-js`
(already installed), Tailwind CSS.

**Spec:** [docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md](../specs/2026-09-24-food-delivery-platform-design.md)

## Global Constraints

- Cart is single-restaurant only — adding an item from a different restaurant
  must prompt to clear the cart first, never silently mix restaurants (spec §2).
- Branding stays isolated to `lib/branding.ts` + Tailwind tokens — no
  hardcoded brand name/color in any new component (spec §2, enforced in Phase 1).
- No login required for browse/cart in this phase — anonymous only; login is
  Phase 3's concern at checkout.
- Google Maps API key is not available yet — the address picker must be a
  manual lat/lng stub that later swaps for the real Maps SDK without changing
  how restaurant-list/menu components consume the picked address (they only
  ever see `{ lat, lng }`, never a Maps-specific type).
- Cuisine tags on a restaurant come from the fixed taxonomy (Phase 1's
  `cuisine_taxonomy` table) — display them as-is, no free-text cuisine input
  anywhere in this phase (there's no vendor UI yet, so this is a display-only
  constraint for now).

## Review Focus

- Empty restaurant list (no restaurants within any reasonable distance, or
  DB temporarily empty) — the page must show an empty state, not crash or
  show a blank white screen.
- Restaurant with `is_open = false` — must not appear in the browsable list
  (or must be visibly marked closed and not addable-to-cart), since Phase 1's
  schema already tracks this and a reasonable customer would expect a closed
  restaurant not to be orderable.
- Adding the same menu item twice — must increment quantity, not create a
  duplicate cart line.
- Switching restaurants mid-cart with items already present — must show the
  clear-cart prompt every time, including a second switch attempt right after
  confirming the first (no state left over that lets the prompt fire once and
  never again).
- Menu item marked `is_available = false` — must not be addable to cart, since
  Phase 1's schema tracks this and a reasonable customer would expect an
  unavailable item to be disabled, not silently orderable.

---

### Task 1: Geo helper + cart store

**Files:**
- Create: `lib/geo.ts`, `lib/cart-store.tsx`
- Test: manual (no test runner configured yet in this project; verified via
  a throwaway page + browser interaction per this task's steps)

**Interfaces:**
- Consumes: nothing (foundational utilities).
- Produces:
  - `haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number` from `lib/geo.ts`, used by Task 3.
  - `CartProvider` (React component) and `useCart()` hook from
    `lib/cart-store.tsx`, exporting:
    ```ts
    type CartItem = { menuItemId: string; name: string; price: number; quantity: number };
    type PendingConflict = { restaurantId: string; restaurantName: string; item: CartItem } | null;
    type CartContextValue = {
      restaurantId: string | null;
      restaurantName: string | null;
      items: CartItem[];
      subtotal: number;
      pendingConflict: PendingConflict;
      addItem: (restaurantId: string, restaurantName: string, item: CartItem) => void;
      updateQuantity: (menuItemId: string, quantity: number) => void;
      removeItem: (menuItemId: string) => void;
      clearCart: () => void;
      confirmClearAndAdd: () => void;
      cancelPendingAdd: () => void;
    };
    ```
    Used by Task 4 (add-to-cart buttons) and Task 5 (cart panel).

- [ ] **Step 1: Write `lib/geo.ts`**

```ts
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

- [ ] **Step 2: Write `lib/cart-store.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type CartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
};

type PendingConflict = {
  restaurantId: string;
  restaurantName: string;
  item: CartItem;
} | null;

type CartContextValue = {
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
  subtotal: number;
  pendingConflict: PendingConflict;
  addItem: (restaurantId: string, restaurantName: string, item: CartItem) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  removeItem: (menuItemId: string) => void;
  clearCart: () => void;
  confirmClearAndAdd: () => void;
  cancelPendingAdd: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "foodhub_cart";

type StoredCart = {
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
};

function loadStoredCart(): StoredCart {
  if (typeof window === "undefined") {
    return { restaurantId: null, restaurantName: null, items: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { restaurantId: null, restaurantName: null, items: [] };
    return JSON.parse(raw) as StoredCart;
  } catch {
    return { restaurantId: null, restaurantName: null, items: [] };
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredCart();
    setRestaurantId(stored.restaurantId);
    setRestaurantName(stored.restaurantName);
    setItems(stored.items);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ restaurantId, restaurantName, items })
      );
    } catch {
      // localStorage unavailable (private mode, quota) — cart just won't persist
    }
  }, [restaurantId, restaurantName, items, hydrated]);

  function addItemDirect(rId: string, rName: string, item: CartItem) {
    setRestaurantId(rId);
    setRestaurantName(rName);
    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.menuItemId);
      if (existing) {
        return prev.map((i) =>
          i.menuItemId === item.menuItemId
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...prev, item];
    });
  }

  function addItem(rId: string, rName: string, item: CartItem) {
    if (restaurantId !== null && restaurantId !== rId) {
      setPendingConflict({ restaurantId: rId, restaurantName: rName, item });
      return;
    }
    addItemDirect(rId, rName, item);
  }

  function confirmClearAndAdd() {
    if (!pendingConflict) return;
    setItems([]);
    addItemDirect(pendingConflict.restaurantId, pendingConflict.restaurantName, pendingConflict.item);
    setPendingConflict(null);
  }

  function cancelPendingAdd() {
    setPendingConflict(null);
  }

  function updateQuantity(menuItemId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(menuItemId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.menuItemId === menuItemId ? { ...i, quantity } : i))
    );
  }

  function removeItem(menuItemId: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.menuItemId !== menuItemId);
      if (next.length === 0) {
        setRestaurantId(null);
        setRestaurantName(null);
      }
      return next;
    });
  }

  function clearCart() {
    setItems([]);
    setRestaurantId(null);
    setRestaurantName(null);
    setPendingConflict(null);
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        restaurantId,
        restaurantName,
        items,
        subtotal,
        pendingConflict,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        confirmClearAndAdd,
        cancelPendingAdd,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
```

- [ ] **Step 3: Verify `haversineDistanceKm` with a throwaway check**

Run: `node -e "
function h(lat1,lng1,lat2,lng2){const R=6371;const dLat=(lat2-lat1)*Math.PI/180;const dLng=(lng2-lng1)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));return R*c;}
console.log(h(19.0760,72.8777,19.0760,72.8777));
console.log(h(19.0760,72.8777,28.6139,77.2090));
"`
Expected: first line `0` (same point), second line roughly `1150`-`1200`
(Mumbai to Delhi, real-world ~1150km) — confirms the formula is correctly
transcribed into `lib/geo.ts` (same logic, copy-pasted for the quick check).

- [ ] **Step 4: Commit**

```bash
git add lib/geo.ts lib/cart-store.tsx
git commit -m "feat: add geo distance helper and cart store"
```

---

### Task 2: Address picker stub

**Files:**
- Create: `lib/address-store.tsx`, `components/AddressPicker.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AddressProvider`/`useAddress()` hook exporting
  `{ lat: number; lng: number; label: string; setAddress: (lat: number, lng: number, label: string) => void }`
  from `lib/address-store.tsx`; `<AddressPicker />` component from
  `components/AddressPicker.tsx`. Task 3 consumes `useAddress()` to know
  which point to sort restaurants from.

- [ ] **Step 1: Write `lib/address-store.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type AddressContextValue = {
  lat: number;
  lng: number;
  label: string;
  setAddress: (lat: number, lng: number, label: string) => void;
};

const AddressContext = createContext<AddressContextValue | null>(null);

const STORAGE_KEY = "foodhub_address";

// Demo Kitchen's seeded location (Phase 1 seed data) — sensible default so
// the restaurant list isn't empty on first load before the customer picks.
const DEFAULT_LAT = 19.076;
const DEFAULT_LNG = 72.8777;
const DEFAULT_LABEL = "Mumbai (default)";

export function AddressProvider({ children }: { children: ReactNode }) {
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [label, setLabel] = useState(DEFAULT_LABEL);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setLat(parsed.lat);
        setLng(parsed.lng);
        setLabel(parsed.label);
      }
    } catch {
      // ignore, defaults stand
    }
  }, []);

  function setAddress(newLat: number, newLng: number, newLabel: string) {
    setLat(newLat);
    setLng(newLng);
    setLabel(newLabel);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lat: newLat, lng: newLng, label: newLabel })
      );
    } catch {
      // localStorage unavailable — address just won't persist across reloads
    }
  }

  return (
    <AddressContext.Provider value={{ lat, lng, label, setAddress }}>
      {children}
    </AddressContext.Provider>
  );
}

export function useAddress(): AddressContextValue {
  const ctx = useContext(AddressContext);
  if (!ctx) throw new Error("useAddress must be used within AddressProvider");
  return ctx;
}
```

- [ ] **Step 2: Write `components/AddressPicker.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useAddress } from "@/lib/address-store";

export function AddressPicker() {
  const { lat, lng, label, setAddress } = useAddress();
  const [open, setOpen] = useState(false);
  const [draftLat, setDraftLat] = useState(String(lat));
  const [draftLng, setDraftLng] = useState(String(lng));
  const [draftLabel, setDraftLabel] = useState(label);

  function handleSave() {
    const parsedLat = parseFloat(draftLat);
    const parsedLng = parseFloat(draftLng);
    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) return;
    setAddress(parsedLat, parsedLng, draftLabel || "Custom location");
    setOpen(false);
  }

  return (
    <div className="border-b border-gray-200 p-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-gray-700"
      >
        📍 {label} ({lat.toFixed(4)}, {lng.toFixed(4)})
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 rounded border border-gray-200 p-3">
          <p className="text-xs text-gray-500">
            Manual location entry (map picker coming once a Google Maps API
            key is configured).
          </p>
          <input
            className="rounded border px-2 py-1 text-sm"
            placeholder="Label (e.g. Home)"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
          />
          <input
            className="rounded border px-2 py-1 text-sm"
            placeholder="Latitude"
            value={draftLat}
            onChange={(e) => setDraftLat(e.target.value)}
          />
          <input
            className="rounded border px-2 py-1 text-sm"
            placeholder="Longitude"
            value={draftLng}
            onChange={(e) => setDraftLng(e.target.value)}
          />
          <button
            onClick={handleSave}
            className="rounded bg-brand-primary px-3 py-1 text-sm text-white"
          >
            Save location
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify with `npm run build`**

Run: `npm run build`
Expected: succeeds with no type errors referencing these two new files
(other pre-existing lint warnings unrelated to this task are fine).

- [ ] **Step 4: Commit**

```bash
git add lib/address-store.tsx components/AddressPicker.tsx
git commit -m "feat: add address picker stub (manual lat/lng entry)"
```

---

### Task 3: Restaurant list page

**Files:**
- Create: `components/RestaurantCard.tsx`, `app/customer/layout.tsx`,
  `app/customer/page.tsx`

**Interfaces:**
- Consumes: `haversineDistanceKm` (Task 1), `useAddress()` (Task 2),
  `supabase` client (Phase 1's `lib/supabase.ts`).
- Produces: `/customer` route rendering a sorted, distance-annotated
  restaurant list; `<RestaurantCard restaurant={...} distanceKm={...} />`
  component reused by nothing else in this phase but kept separate per the
  plan's file-structure convention (one clear responsibility per file).

- [ ] **Step 1: Write `app/customer/layout.tsx`**

Wraps the customer surface in both providers so every page under
`/customer/*` (this phase and Task 4's menu page) shares one cart/address
state.

```tsx
import { ReactNode } from "react";
import { CartProvider } from "@/lib/cart-store";
import { AddressProvider } from "@/lib/address-store";
import { AddressPicker } from "@/components/AddressPicker";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <AddressProvider>
      <CartProvider>
        <AddressPicker />
        <main className="mx-auto max-w-3xl p-4">{children}</main>
      </CartProvider>
    </AddressProvider>
  );
}
```

- [ ] **Step 2: Write `components/RestaurantCard.tsx`**

```tsx
type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
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
      className="block rounded-lg border border-gray-200 p-4 hover:border-brand-primary"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{restaurant.name}</h3>
        <span className="text-sm text-gray-500">{distanceKm.toFixed(1)} km</span>
      </div>
      <p className="text-sm text-gray-500">{restaurant.cuisine_tags.join(", ")}</p>
      <div className="mt-1 flex items-center gap-3 text-sm">
        <span>⭐ {restaurant.rating.toFixed(1)}</span>
        <span>{restaurant.avg_prep_minutes} min</span>
      </div>
    </a>
  );
}
```

- [ ] **Step 3: Write `app/customer/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAddress } from "@/lib/address-store";
import { haversineDistanceKm } from "@/lib/geo";
import { RestaurantCard } from "@/components/RestaurantCard";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  lat: number;
  lng: number;
};

export default function CustomerHomePage() {
  const { lat, lng } = useAddress();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: fetchError } = await supabase
        .from("restaurants")
        .select("id, name, cuisine_tags, rating, avg_prep_minutes, is_open, lat, lng")
        .eq("is_open", true);
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setRestaurants(data ?? []);
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
    return <p className="text-gray-500">Loading restaurants…</p>;
  }

  if (restaurants.length === 0) {
    return <p className="text-gray-500">No open restaurants near you right now.</p>;
  }

  const sorted = [...restaurants]
    .map((r) => ({ r, distanceKm: haversineDistanceKm(lat, lng, r.lat, r.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return (
    <div className="flex flex-col gap-3">
      {sorted.map(({ r, distanceKm }) => (
        <RestaurantCard key={r.id} restaurant={r} distanceKm={distanceKm} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npx supabase status` (confirm local stack running; if not, `npx supabase start`), then `npm run dev`.
Open `http://localhost:3000/customer` in a browser.
Expected: "Demo Kitchen" (Phase 1 seed data) appears in the list with cuisine
tags "indian, fast_food", a distance of `0.0 km` (default picked address
matches the seeded restaurant's coordinates), rating `4.2`, `25 min`.

- [ ] **Step 5: Commit**

```bash
git add components/RestaurantCard.tsx app/customer/layout.tsx app/customer/page.tsx
git commit -m "feat: add customer restaurant list page"
```

---

### Task 4: Restaurant menu + add-to-cart

**Files:**
- Create: `app/customer/restaurants/[id]/page.tsx`,
  `components/MenuItemRow.tsx`, `components/CartConflictDialog.tsx`

**Interfaces:**
- Consumes: `useCart()` (Task 1), `supabase` client.
- Produces: `/customer/restaurants/[id]` route; `<MenuItemRow item={...} restaurantId={...} restaurantName={...} />`;
  `<CartConflictDialog />` (reads `pendingConflict` from `useCart()`
  directly, no props needed — mounted once in the customer layout so it can
  appear regardless of which page triggered the conflict).

- [ ] **Step 1: Write `components/CartConflictDialog.tsx`**

```tsx
"use client";

import { useCart } from "@/lib/cart-store";

export function CartConflictDialog() {
  const { pendingConflict, confirmClearAndAdd, cancelPendingAdd } = useCart();

  if (!pendingConflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <p className="mb-4">
          Your cart has items from another restaurant. Start a new cart for{" "}
          <strong>{pendingConflict.restaurantName}</strong>?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={cancelPendingAdd}
            className="rounded border px-3 py-1 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={confirmClearAndAdd}
            className="rounded bg-brand-primary px-3 py-1 text-sm text-white"
          >
            Clear cart and add
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire `CartConflictDialog` into the customer layout**

Modify `app/customer/layout.tsx` (created in Task 3): import
`CartConflictDialog` from `@/components/CartConflictDialog` and render it
once, inside `<CartProvider>`, alongside `<AddressPicker />`:

```tsx
import { ReactNode } from "react";
import { CartProvider } from "@/lib/cart-store";
import { AddressProvider } from "@/lib/address-store";
import { AddressPicker } from "@/components/AddressPicker";
import { CartConflictDialog } from "@/components/CartConflictDialog";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <AddressProvider>
      <CartProvider>
        <AddressPicker />
        <CartConflictDialog />
        <main className="mx-auto max-w-3xl p-4">{children}</main>
      </CartProvider>
    </AddressProvider>
  );
}
```

- [ ] **Step 3: Write `components/MenuItemRow.tsx`**

```tsx
"use client";

import { useCart } from "@/lib/cart-store";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
};

export function MenuItemRow({
  item,
  restaurantId,
  restaurantName,
}: {
  item: MenuItem;
  restaurantId: string;
  restaurantName: string;
}) {
  const { addItem } = useCart();

  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-3">
      <div>
        <p className="font-medium">
          {item.is_veg ? "🟢" : "🔴"} {item.name}
        </p>
        {item.description && (
          <p className="text-sm text-gray-500">{item.description}</p>
        )}
        <p className="text-sm">₹{item.price.toFixed(2)}</p>
      </div>
      <button
        disabled={!item.is_available}
        onClick={() =>
          addItem(restaurantId, restaurantName, {
            menuItemId: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
          })
        }
        className="rounded bg-brand-primary px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {item.is_available ? "Add" : "Unavailable"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write `app/customer/restaurants/[id]/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MenuItemRow } from "@/components/MenuItemRow";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
};

type Restaurant = { id: string; name: string };

export default function RestaurantMenuPage() {
  const params = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: r, error: rErr }, { data: items, error: iErr }] =
        await Promise.all([
          supabase.from("restaurants").select("id, name").eq("id", params.id).single(),
          supabase
            .from("menu_items")
            .select("id, name, description, price, is_veg, is_available")
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

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load menu: {error}</p>;
  }

  if (!restaurant || menuItems === null) {
    return <p className="text-gray-500">Loading menu…</p>;
  }

  if (menuItems.length === 0) {
    return <p className="text-gray-500">{restaurant.name} has no menu items yet.</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">{restaurant.name}</h1>
      <div className="flex flex-col">
        {menuItems.map((item) => (
          <MenuItemRow
            key={item.id}
            item={item}
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify manually**

`npm run dev`, open `http://localhost:3000/customer`, click into "Demo
Kitchen". Expected: two menu items ("Paneer Butter Masala" ₹220.00, "Veg
Fried Rice" ₹150.00) both marked 🟢 and available. Click "Add" on one item
twice — confirm no crash (cart conflict dialog only relevant across
different restaurants, tested in Task 5/6).

- [ ] **Step 6: Commit**

```bash
git add components/CartConflictDialog.tsx components/MenuItemRow.tsx app/customer/restaurants/ app/customer/layout.tsx
git commit -m "feat: add restaurant menu page with add-to-cart"
```

---

### Task 5: Cart panel

**Files:**
- Create: `components/CartPanel.tsx`
- Modify: `app/customer/layout.tsx` (mount the panel)

**Interfaces:**
- Consumes: `useCart()` (Task 1).
- Produces: a persistent cart summary bar/panel visible on every
  `/customer/*` page, showing item count, subtotal, and a way to open a
  detail view listing items with quantity controls.

- [ ] **Step 1: Write `components/CartPanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart-store";

export function CartPanel() {
  const { restaurantName, items, subtotal, updateQuantity, removeItem, clearCart } =
    useCart();
  const [open, setOpen] = useState(false);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white shadow-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="text-sm">
          {itemCount} item{itemCount !== 1 ? "s" : ""} from {restaurantName}
        </span>
        <span className="font-semibold">₹{subtotal.toFixed(2)}</span>
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto border-t border-gray-100 px-4 py-2">
          {items.map((item) => (
            <div
              key={item.menuItemId}
              className="flex items-center justify-between py-2"
            >
              <span className="text-sm">{item.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                  className="rounded border px-2"
                >
                  −
                </button>
                <span>{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                  className="rounded border px-2"
                >
                  +
                </button>
                <button
                  onClick={() => removeItem(item.menuItemId)}
                  className="text-xs text-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={clearCart}
            className="mt-2 text-xs text-gray-500 underline"
          >
            Clear cart
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount it in `app/customer/layout.tsx`**

```tsx
import { ReactNode } from "react";
import { CartProvider } from "@/lib/cart-store";
import { AddressProvider } from "@/lib/address-store";
import { AddressPicker } from "@/components/AddressPicker";
import { CartConflictDialog } from "@/components/CartConflictDialog";
import { CartPanel } from "@/components/CartPanel";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <AddressProvider>
      <CartProvider>
        <AddressPicker />
        <CartConflictDialog />
        <main className="mx-auto max-w-3xl p-4 pb-24">{children}</main>
        <CartPanel />
      </CartProvider>
    </AddressProvider>
  );
}
```

(Note the added `pb-24` on `<main>` so the fixed-position cart panel never
overlaps page content.)

- [ ] **Step 3: Verify manually — full flow**

`npm run dev`, open `http://localhost:3000/customer`.
1. Add "Paneer Butter Masala" — cart panel appears showing "1 item from Demo
   Kitchen — ₹220.00".
2. Add it again — panel updates to "1 item" still (same line), quantity 2,
   subtotal ₹440.00 (confirms Review Focus: same-item-twice increments, no
   duplicate line).
3. Open the panel, use −/+ to adjust quantity, confirm subtotal updates.
4. Reload the page — cart contents persist (localStorage).
5. Since there's only one seeded restaurant, cross-restaurant conflict can't
   be exercised live in this environment yet — confirmed by code review in
   Task 1/4 instead (the conflict logic is exercised by Task 6's automated
   walkthrough note below).

- [ ] **Step 4: Commit**

```bash
git add components/CartPanel.tsx app/customer/layout.tsx
git commit -m "feat: add cart panel with quantity controls"
```

---

### Task 6: Root redirect + cross-restaurant conflict verification

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: visiting `/` sends the user into `/customer` (the only surface
  built so far — vendor/delivery/admin land in later phases).

- [ ] **Step 1: Modify `app/page.tsx` to redirect to `/customer`**

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/customer");
}
```

- [ ] **Step 2: Verify the redirect**

Run: `npm run dev`, open `http://localhost:3000/`.
Expected: browser lands on `/customer` and shows the restaurant list.

- [ ] **Step 3: Verify the cross-restaurant clear-cart prompt with a second seeded restaurant**

The Phase 1 seed only has one restaurant ("Demo Kitchen"), so the
clear-cart prompt can't be triggered through the UI yet. Add a second demo
restaurant via a one-off SQL insert (not a migration — this is throwaway
verification data, clean it up after):

```bash
npx supabase db query "insert into public.restaurants (id, owner_id, name, cuisine_tags, lat, lng, is_open, avg_prep_minutes, rating) values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'Second Test Kitchen', array['chinese'], 19.08, 72.88, true, 20, 4.0);"
npx supabase db query "insert into public.menu_items (id, restaurant_id, name, price, is_veg, is_available) values ('88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999', 'Test Noodles', 180, true, true);"
```

In the browser: add "Paneer Butter Masala" from Demo Kitchen to the cart,
then navigate to `/customer/restaurants/99999999-9999-9999-9999-999999999999`
and click "Add" on "Test Noodles". Expected: the `CartConflictDialog`
appears asking to clear the cart for "Second Test Kitchen". Click "Cancel" —
dialog closes, cart still has the Demo Kitchen item. Try adding "Test
Noodles" again — dialog reappears (confirms Review Focus: prompt fires every
time, not just once). Click "Clear cart and add" — cart now has only "Test
Noodles" from "Second Test Kitchen".

Clean up the throwaway data:
```bash
npx supabase db query "delete from public.menu_items where id = '88888888-8888-8888-8888-888888888888';"
npx supabase db query "delete from public.restaurants where id = '99999999-9999-9999-9999-999999999999';"
```

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: redirect root to customer browse page"
```
