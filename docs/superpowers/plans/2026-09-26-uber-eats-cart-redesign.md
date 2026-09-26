# Uber Eats-style redesign — Piece 5: Cart redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the bottom-anchored, inline-expanding `CartPanel` into a slide-out drawer with line-item thumbnails and a whole-order note, on top of a new shared delivery-fee hook so the drawer's preview total can never drift from the checkout page's real total.

**Architecture:** `CartPanel` stays a single client component mounted once in `app/customer/layout.tsx`; its `open` boolean now drives a right-side slide transition over a backdrop instead of an inline height expansion. `lib/cart-store.tsx` gains an `imageUrl` field on `CartItem` (backward-compatible via `normalizeStoredItem`) and a new `orderNote` string plus `setOrderNote` action, persisted the same way `items` already is. A new `orders.delivery_note` column and an updated `checkout_place_order` RPC parameter carry the note from the client into the database and out to the vendor's order view.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, self-hosted Supabase (Postgres + RPC), React Context for the cart store — same stack as pieces 1-4, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-26-uber-eats-cart-redesign-design.md`

## Global Constraints

- Money (prices, deltas, totals) must use integer-paise arithmetic, never float multiplication — `delivery_fee_paise` stays an integer column read as-is; only display formatting divides by 100.
- API routes that create data on a customer's behalf must derive identity from a verified session token (`Authorization: Bearer <token>` via `supabaseServer.auth.getUser`), never from a client-supplied id — the checkout route already does this; the new `deliveryNote` field must not change that.
- Run `npm run build` before marking any task done — a missing Suspense boundary or type error has broken this project's production build before.
- Never add an RLS write policy "for defense in depth" on a table only ever written through a service-role API route — this plan adds a column to `orders`, not a new table, so no new policy is needed; do not add one.
- Special-instructions-style free text fields are capped at 500 characters, enforced both client-side (`maxLength`) and server-side (400 response over the cap) — the existing per-line note follows this pattern; the new order-level note must too.

## Review Focus

- An old cart item already in a customer's `localStorage` from before this piece has no `imageUrl` field at all — the drawer must render a placeholder for it, not crash or silently wipe the whole cart on load (piece 4's `normalizeStoredItem` already handles missing fields this way; the same discipline applies to the new field).
- A whitespace-only order note (customer types spaces, doesn't confirm anything) should normalize to `null`/empty on blur, not persist as a non-empty string that later shows up as a note bubble in the vendor UI — mirrors how `setSpecialInstructions` already trims.
- The drawer must close on Escape, not just the ✕ button and backdrop click — an easy path to omit since neither existing piece-1-4 modal (`ItemCustomizationModal`) wires a keydown listener, so there's no copy-paste precedent to lean on.
- `useDeliveryFee`'s existing `cancelled` guard (stale-response protection when `restaurantId` changes mid-fetch) must survive the extraction from the checkout page into a shared hook — an easy regression when lifting an effect into a hook is to drop the cleanup closure.
- A vendor viewing an order placed before this migration ships has `delivery_note = null` (column added with no default backfill needed since it's nullable) — the vendor order list must render those orders with no "Order note:" line, not a blank one or a crash.

---

## File Structure

- **Create:** `supabase/migrations/00000000000018_order_delivery_note.sql` — new nullable column + RPC update.
- **Create:** `lib/use-delivery-fee.ts` — shared hook, extracted from the checkout page's existing inline fetch.
- **Modify:** `lib/cart-store.tsx` — `CartItem.imageUrl`, `orderNote` state/action, persistence, backward-compatible parsing.
- **Modify:** `components/MenuItemRow.tsx` — pass `imageUrl` on Quick Add.
- **Modify:** `components/ItemCustomizationModal.tsx` — pass `imageUrl` on customized add.
- **Modify:** `components/CartPanel.tsx` — full rewrite as a slide-out drawer using `useDeliveryFee`.
- **Modify:** `app/api/cart/checkout/route.ts` — accept, validate, cap, and forward `deliveryNote`.
- **Modify:** `app/customer/checkout/page.tsx` — switch to `useDeliveryFee`, send `orderNote` in the checkout POST.
- **Modify:** `app/api/vendor/orders/route.ts` — select `delivery_note`.
- **Modify:** `app/vendor/orders/page.tsx` — display the order-level note.

---

### Task 1: Migration — `orders.delivery_note` column and RPC update

**Files:**
- Create: `supabase/migrations/00000000000018_order_delivery_note.sql`

**Interfaces:**
- Consumes: the existing `checkout_place_order(p_customer_id, p_address_label, p_address_line1, p_address_lat, p_address_lng, p_restaurant_id, p_subtotal, p_delivery_fee, p_total, p_items, p_payment_method, p_payment_status, p_payment_amount, p_payment_paid_at)` function from `supabase/migrations/00000000000017_item_customization.sql`.
- Produces: `orders.delivery_note text` (nullable, no default). `checkout_place_order` gains a 15th parameter, `p_delivery_note text default null`, appended after `p_payment_paid_at` so `create or replace function` keeps the same signature prefix — Task 6's checkout route calls the RPC with this new named argument.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00000000000018_order_delivery_note.sql`:

```sql
-- Piece 5 (cart redesign): a whole-order note, distinct from
-- order_items.special_instructions (per-line notes, piece 4).
alter table public.orders add column delivery_note text;

create or replace function public.checkout_place_order(
  p_customer_id uuid,
  p_address_label text,
  p_address_line1 text,
  p_address_lat numeric,
  p_address_lng numeric,
  p_restaurant_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_items jsonb, -- array of {menu_item_id, quantity, unit_price, special_instructions, options: [{option_id, group_name, option_name, price_delta_paise}]}
  p_payment_method text,
  p_payment_status text,
  p_payment_amount numeric,
  p_payment_paid_at timestamptz,
  p_delivery_note text default null
) returns table (order_id uuid, address_id uuid) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_order_item_id uuid;
  v_option jsonb;
begin
  insert into public.addresses (user_id, label, line1, lat, lng, is_default)
    values (
      p_customer_id,
      p_address_label,
      p_address_line1,
      p_address_lat,
      p_address_lng,
      false
    )
    returning id into v_address_id;

  insert into public.orders (customer_id, restaurant_id, delivery_address_id, status, subtotal, delivery_fee, total, delivery_note)
    values (p_customer_id, p_restaurant_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total, p_delivery_note)
    returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price, special_instructions)
      values (
        v_order_id,
        (v_item->>'menu_item_id')::uuid,
        (v_item->>'quantity')::integer,
        (v_item->>'unit_price')::numeric,
        v_item->>'special_instructions'
      )
      returning id into v_order_item_id;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb))
    loop
      insert into public.order_item_options (order_item_id, menu_item_option_id, group_name, option_name, price_delta_paise)
        values (
          v_order_item_id,
          (v_option->>'option_id')::uuid,
          v_option->>'group_name',
          v_option->>'option_name',
          (v_option->>'price_delta_paise')::integer
        );
    end loop;
  end loop;

  insert into public.payments (order_id, method, status, amount, mock_reference, paid_at)
    values (
      v_order_id,
      p_payment_method,
      p_payment_status,
      p_payment_amount,
      'MOCK-' || left(v_order_id::text, 8),
      p_payment_paid_at
    );

  return query select v_order_id, v_address_id;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.checkout_place_order from public, anon, authenticated;
grant execute on function public.checkout_place_order to service_role;
```

- [ ] **Step 2: Apply to the running local Supabase stack**

Run: `npx supabase db reset` (requires Docker Desktop running and the local stack up — if unsure it's running, `npx supabase status` first)
Expected: resets cleanly, replaying all 18 migrations plus `supabase/seed.sql`, no errors.

- [ ] **Step 3: Verify the RPC still places a plain order with no note**

```bash
docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select p_delivery_note from pg_proc where proname = 'checkout_place_order';" 2>&1 | head -5
```

This just confirms the function reloaded — the real functional check is Task 6's live verification. For now, confirm the column exists:

```bash
docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "\d public.orders" | grep delivery_note
```

Expected: a line showing `delivery_note | text |`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00000000000018_order_delivery_note.sql
git commit -m "feat: add orders.delivery_note column and thread it through checkout_place_order"
```

---

### Task 2: Cart store — `imageUrl` on cart items, `orderNote` state

**Files:**
- Modify: `lib/cart-store.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks — this is the foundation task.
- Produces: `CartItem` now includes `imageUrl: string | null`. `CartContextValue` gains `orderNote: string` and `setOrderNote: (text: string) => void`. `NewCartItem` (used by `addItem`) requires `imageUrl` on every call site — Task 3 updates both callers.

- [ ] **Step 1: Add `imageUrl` to `CartItem` and update `normalizeStoredItem`**

In `lib/cart-store.tsx`, update the `CartItem` type (around line 12):

```typescript
export type CartItem = {
  lineId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  selectedOptions: SelectedOption[];
  specialInstructions: string | null;
};
```

Update `normalizeStoredItem` to read and default the new field (around line 66, inside the function body, after the `specialInstructions` line and before the `lineId` line):

```typescript
  const specialInstructions =
    typeof raw.specialInstructions === "string" ? raw.specialInstructions : null;
  const imageUrl = typeof raw.imageUrl === "string" ? raw.imageUrl : null;
  const lineId =
    typeof raw.lineId === "string" ? raw.lineId : buildLineId(raw.menuItemId, selectedOptions);
  return {
    lineId,
    menuItemId: raw.menuItemId,
    name: raw.name,
    price: raw.price,
    quantity: raw.quantity,
    imageUrl,
    selectedOptions,
    specialInstructions,
  };
```

- [ ] **Step 2: Add `orderNote` state, persistence, and `setOrderNote`**

Update the `CartContextValue` type (around line 32) to add the field and action:

```typescript
type CartContextValue = {
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
  subtotal: number;
  orderNote: string;
  pendingConflict: PendingConflict;
  addItem: (restaurantId: string, restaurantName: string, item: NewCartItem) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  setSpecialInstructions: (lineId: string, text: string) => void;
  setOrderNote: (text: string) => void;
  clearCart: () => void;
  confirmClearAndAdd: () => void;
  cancelPendingAdd: () => void;
};
```

Update `StoredCart` (around line 50) and `loadStoredCart` to carry `orderNote`:

```typescript
type StoredCart = {
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
  orderNote: string;
};
```

In `loadStoredCart`, update both early returns and the success path to include `orderNote: ""` / the parsed value:

```typescript
function loadStoredCart(): StoredCart {
  if (typeof window === "undefined") {
    return { restaurantId: null, restaurantName: null, items: [], orderNote: "" };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { restaurantId: null, restaurantName: null, items: [], orderNote: "" };
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !(parsed.restaurantId === null || typeof parsed.restaurantId === "string") ||
      !(parsed.restaurantName === null || typeof parsed.restaurantName === "string") ||
      !Array.isArray(parsed.items)
    ) {
      return { restaurantId: null, restaurantName: null, items: [], orderNote: "" };
    }
    const items = (parsed.items as unknown[])
      .map((i) =>
        i !== null && typeof i === "object"
          ? normalizeStoredItem(i as Record<string, unknown>)
          : null
      )
      .filter((i): i is CartItem => i !== null);
    const orderNote = typeof parsed.orderNote === "string" ? parsed.orderNote : "";
    return { restaurantId: parsed.restaurantId, restaurantName: parsed.restaurantName, items, orderNote };
  } catch {
    return { restaurantId: null, restaurantName: null, items: [], orderNote: "" };
  }
}
```

In `CartProvider`, add the state and wire it into hydration/persistence/reset (the function currently has `restaurantId`, `restaurantName`, `items`, `pendingConflict`, `hydrated` state — add `orderNote` alongside):

```typescript
  const [orderNote, setOrderNoteState] = useState("");
```

Update the hydration effect:

```typescript
  useEffect(() => {
    const stored = loadStoredCart();
    setRestaurantId(stored.restaurantId);
    setRestaurantName(stored.restaurantName);
    setItems(stored.items);
    setOrderNoteState(stored.orderNote);
    setHydrated(true);
  }, []);
```

Update the persistence effect's dependency array and payload:

```typescript
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ restaurantId, restaurantName, items, orderNote })
      );
    } catch {
      // localStorage unavailable (private mode, quota) — cart just won't persist
    }
  }, [restaurantId, restaurantName, items, orderNote, hydrated]);
```

Add the `setOrderNote` action (near `setSpecialInstructions`), normalizing whitespace-only input to an empty string (mirrors `setSpecialInstructions`'s null-on-blank behavior, using `""` instead of `null` since `orderNote` is a plain string, not nullable, to keep the type simple — Task 1's DB column is nullable and Task 6's route converts `""` to `null` before sending it to the RPC):

```typescript
  function setOrderNote(text: string) {
    setOrderNoteState(text.trim() === "" ? "" : text);
  }
```

Update `clearCart` to also reset the note:

```typescript
  function clearCart() {
    setItems([]);
    setRestaurantId(null);
    setRestaurantName(null);
    setOrderNoteState("");
    setPendingConflict(null);
  }
```

Update `confirmClearAndAdd` to reset the note when switching restaurants (a note written for restaurant A's order shouldn't survive into restaurant B's):

```typescript
  function confirmClearAndAdd() {
    if (!pendingConflict) return;
    setItems([]);
    setOrderNoteState("");
    addItemDirect(pendingConflict.restaurantId, pendingConflict.restaurantName, pendingConflict.item);
    setPendingConflict(null);
  }
```

Finally, add `orderNote` and `setOrderNote` to the context value object passed to `CartContext.Provider`:

```typescript
    <CartContext.Provider
      value={{
        restaurantId,
        restaurantName,
        items,
        subtotal,
        orderNote,
        pendingConflict,
        addItem,
        updateQuantity,
        removeItem,
        setSpecialInstructions,
        setOrderNote,
        clearCart,
        confirmClearAndAdd,
        cancelPendingAdd,
      }}
    >
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: fails at this point — `MenuItemRow.tsx` and `ItemCustomizationModal.tsx` construct `NewCartItem` objects without `imageUrl`, which TypeScript now requires. This is expected; Task 3 fixes it. Confirm the failure is specifically about the missing `imageUrl` property on those two files' `addItem` calls, not something else.

- [ ] **Step 3: Commit**

```bash
git add lib/cart-store.tsx
git commit -m "feat: add imageUrl and orderNote to cart store"
```

---

### Task 3: Wire `imageUrl` into both `addItem` call sites

**Files:**
- Modify: `components/MenuItemRow.tsx`
- Modify: `components/ItemCustomizationModal.tsx`

**Interfaces:**
- Consumes: `CartItem`/`NewCartItem` from Task 2 (now requires `imageUrl: string | null` on every `addItem` call).
- Produces: nothing new — this task only makes the existing two callers satisfy Task 2's widened type. Task 5 (the drawer) reads `item.imageUrl` from the resulting `CartItem`s.

- [ ] **Step 1: Pass `imageUrl` from `MenuItemRow`'s Quick Add**

In `components/MenuItemRow.tsx`, update `handleAddClick`'s `addItem` call:

```typescript
  function handleAddClick() {
    if (hasOptions) {
      setModalOpen(true);
      return;
    }
    addItem(restaurantId, restaurantName, {
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      imageUrl: item.image_url,
      selectedOptions: [],
      specialInstructions: null,
    });
  }
```

- [ ] **Step 2: Pass `imageUrl` from `ItemCustomizationModal`'s customized Add**

In `components/ItemCustomizationModal.tsx`, the local `Item` type (near the top) currently omits `image_url`. Update it:

```typescript
type Item = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
};
```

Update `handleAdd`'s `addItem` call:

```typescript
  function handleAdd() {
    if (!allGroupsValid) return;
    addItem(restaurantId, restaurantName, {
      menuItemId: item.id,
      name: item.name,
      price: unitPricePaise / 100,
      quantity,
      imageUrl: item.image_url,
      selectedOptions,
      specialInstructions: null,
    });
    onClose();
  }
```

`MenuItemRow` already passes its full `item` object (which includes `image_url`) as the `item` prop to `ItemCustomizationModal` (`<ItemCustomizationModal item={item} ... />`), so no change is needed at that call site — TypeScript's structural typing accepts the wider `MenuItemRow`-local `MenuItem` object wherever the modal's narrower `Item` type is expected, and the modal's own type now declares the field it needs.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: succeeds — TypeScript, all routes generated.

- [ ] **Step 4: Commit**

```bash
git add components/MenuItemRow.tsx components/ItemCustomizationModal.tsx
git commit -m "feat: pass image_url into cart items from both add-to-cart paths"
```

---

### Task 4: Shared `useDeliveryFee` hook

**Files:**
- Create: `lib/use-delivery-fee.ts`

**Interfaces:**
- Consumes: `supabase` client from `@/lib/supabase` (same import the checkout page already uses).
- Produces: `useDeliveryFee(restaurantId: string | null): { deliveryFeePaise: number | null; loading: boolean; error: string | null }` — Task 5 (drawer) and Task 6 (checkout page) both call this with the cart's `restaurantId`.

- [ ] **Step 1: Write the hook**

Create `lib/use-delivery-fee.ts`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useDeliveryFee(restaurantId: string | null) {
  const [deliveryFeePaise, setDeliveryFeePaise] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!restaurantId) {
      setDeliveryFeePaise(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    async function loadFee() {
      const { data, error: fetchError } = await supabase
        .from("restaurants")
        .select("delivery_fee_paise")
        .eq("id", restaurantId)
        .single();
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      setDeliveryFeePaise(data ? data.delivery_fee_paise : null);
      setLoading(false);
    }

    loadFee();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return { deliveryFeePaise, loading, error };
}
```

Note the `cancelled` guard is preserved exactly as it existed in the checkout page's original inline effect (Review Focus item 4) — if `restaurantId` changes again before the first fetch resolves, the stale response is discarded instead of overwriting the newer restaurant's fee.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: succeeds (this file isn't wired into anything yet, so it should compile standalone).

- [ ] **Step 3: Commit**

```bash
git add lib/use-delivery-fee.ts
git commit -m "feat: extract shared useDeliveryFee hook"
```

---

### Task 5: `CartPanel` — slide-out drawer with thumbnails and order note

**Files:**
- Modify: `components/CartPanel.tsx`

**Interfaces:**
- Consumes: `useCart()` (now including `orderNote`/`setOrderNote` from Task 2, and `imageUrl` on each `CartItem` from Task 2/3), `useDeliveryFee(restaurantId)` from Task 4.
- Produces: nothing new for later tasks — this is the final UI consumer of the cart store and the hook.

- [ ] **Step 1: Replace the full contents of `components/CartPanel.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/cart-store";
import { useDeliveryFee } from "@/lib/use-delivery-fee";

export function CartPanel() {
  const {
    restaurantId,
    restaurantName,
    items,
    subtotal,
    orderNote,
    updateQuantity,
    removeItem,
    setSpecialInstructions,
    setOrderNote,
    clearCart,
  } = useCart();
  const [open, setOpen] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [orderNoteDraft, setOrderNoteDraft] = useState<string | null>(null);
  const { deliveryFeePaise, loading: feeLoading } = useDeliveryFee(open ? restaurantId : null);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (items.length === 0) return null;

  function noteValue(lineId: string, current: string | null) {
    return noteDrafts[lineId] ?? current ?? "";
  }

  const total =
    deliveryFeePaise !== null ? subtotal + deliveryFeePaise / 100 : null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 border-t border-brand-ink-muted/15 bg-brand-surface shadow-lg">
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="text-sm text-brand-ink">
            {itemCount} item{itemCount !== 1 ? "s" : ""} from {restaurantName}
          </span>
          <span className="font-semibold text-brand-ink">₹{subtotal.toFixed(2)}</span>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed inset-y-0 right-0 flex w-full max-w-md flex-col bg-brand-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-brand-ink-muted/10 px-4 py-3">
              <h2 className="text-lg font-bold text-brand-ink">{restaurantName}</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close cart"
                className="text-brand-ink-muted"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2">
              {items.map((item) => (
                <div key={item.lineId} className="border-b border-brand-ink-muted/10 py-3 last:border-b-0">
                  <div className="flex items-start gap-3">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={56}
                        height={56}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-14 w-14 shrink-0 rounded-lg bg-brand-accent/10" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-brand-ink">{item.name}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                            className="rounded border border-brand-ink-muted/20 px-2"
                          >
                            −
                          </button>
                          <span className="text-brand-ink">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                            className="rounded border border-brand-ink-muted/20 px-2"
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeItem(item.lineId)}
                            className="text-xs text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {item.selectedOptions.length > 0 && (
                        <p className="mt-0.5 text-xs text-brand-ink-muted">
                          {item.selectedOptions.map((o) => o.optionName).join(", ")}
                        </p>
                      )}
                      <input
                        type="text"
                        value={noteValue(item.lineId, item.specialInstructions)}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({ ...prev, [item.lineId]: e.target.value }))
                        }
                        onBlur={(e) => setSpecialInstructions(item.lineId, e.target.value)}
                        maxLength={500}
                        placeholder="Add a note (optional)"
                        className="mt-1 w-full rounded border border-brand-ink-muted/15 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium text-brand-ink">
                  Order note
                </label>
                <textarea
                  value={orderNoteDraft ?? orderNote}
                  onChange={(e) => setOrderNoteDraft(e.target.value)}
                  onBlur={(e) => {
                    setOrderNote(e.target.value);
                    setOrderNoteDraft(null);
                  }}
                  maxLength={500}
                  placeholder="Add a note for the whole order (e.g. gate code, leave at door)"
                  rows={2}
                  className="w-full rounded border border-brand-ink-muted/15 px-2 py-1 text-sm"
                />
              </div>
            </div>

            <div className="border-t border-brand-ink-muted/10 px-4 py-3">
              <div className="flex flex-col gap-1 text-sm text-brand-ink-muted">
                <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
                {feeLoading ? (
                  <p>Delivery fee: …</p>
                ) : deliveryFeePaise !== null ? (
                  <p>Delivery fee: ₹{(deliveryFeePaise / 100).toFixed(2)}</p>
                ) : null}
                {total !== null && (
                  <p className="font-semibold text-brand-ink">Total: ₹{total.toFixed(2)}</p>
                )}
              </div>
              <button onClick={clearCart} className="mt-2 text-xs text-brand-ink-muted underline">
                Clear cart
              </button>
              <Link
                href="/customer/checkout"
                className="mt-2 block rounded-full bg-brand-primary px-3 py-2 text-center text-sm font-semibold text-white"
              >
                Checkout
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

Note on `useDeliveryFee(open ? restaurantId : null)`: the fee is only fetched while the drawer is open, avoiding an unnecessary background request every time an item is added while the drawer is closed (the bottom bar itself never needs the fee, only the drawer's footer does).

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: succeeds — TypeScript, all routes generated.

- [ ] **Step 3: Commit**

```bash
git add components/CartPanel.tsx
git commit -m "feat: rebuild CartPanel as a slide-out drawer with thumbnails and an order note"
```

---

### Task 6: Checkout route + page — persist and send the order note, share the fee hook

**Files:**
- Modify: `app/api/cart/checkout/route.ts`
- Modify: `app/customer/checkout/page.tsx`

**Interfaces:**
- Consumes: `useDeliveryFee` from Task 4; `orderNote` from `useCart()` (Task 2); the RPC's new `p_delivery_note` parameter from Task 1.
- Produces: nothing new for later tasks — this is the final write path for the order note.

- [ ] **Step 1: Accept and validate `deliveryNote` in the checkout route**

In `app/api/cart/checkout/route.ts`, update the destructured request body (currently `restaurantId, items, deliveryAddress, paymentMethod, expectedTotal`):

```typescript
  const body = await request.json();
  const {
    restaurantId,
    items,
    deliveryAddress,
    paymentMethod,
    expectedTotal,
    deliveryNote,
  }: {
    restaurantId: string;
    items: CheckoutRequestItem[];
    deliveryAddress: { label: string; lat: number; lng: number };
    paymentMethod: "mock_card" | "mock_upi" | "mock_cod";
    expectedTotal?: number;
    deliveryNote?: string | null;
  } = body;
```

Add validation right after the existing `deliveryAddress` shape check (after the block ending `return NextResponse.json({ error: "Invalid delivery address" }, { status: 400 });`):

```typescript
  if (deliveryNote !== undefined && deliveryNote !== null && typeof deliveryNote !== "string") {
    return NextResponse.json({ error: "Invalid delivery note" }, { status: 400 });
  }
  if (typeof deliveryNote === "string" && deliveryNote.length > 500) {
    return NextResponse.json(
      { error: "Delivery note must be 500 characters or fewer" },
      { status: 400 }
    );
  }
  const normalizedDeliveryNote =
    typeof deliveryNote === "string" && deliveryNote.trim() !== "" ? deliveryNote : null;
```

Pass it to the RPC call — update the `supabaseServer.rpc("checkout_place_order", { ... })` call to add the new argument:

```typescript
  const { data: rpcRows, error: rpcError } = await supabaseServer.rpc("checkout_place_order", {
    p_customer_id: customerId,
    p_address_label: deliveryAddress.label,
    p_address_line1: deliveryAddress.label,
    p_address_lat: deliveryAddress.lat,
    p_address_lng: deliveryAddress.lng,
    p_restaurant_id: restaurantId,
    p_subtotal: subtotal,
    p_delivery_fee: deliveryFeePaise / 100,
    p_total: total,
    p_items: orderItemsPayload,
    p_payment_method: paymentMethod,
    p_payment_status: paymentStatus,
    p_payment_amount: total,
    p_payment_paid_at: paymentSucceeds ? new Date().toISOString() : null,
    p_delivery_note: normalizedDeliveryNote,
  });
```

- [ ] **Step 2: Switch the checkout page to `useDeliveryFee` and send `orderNote`**

In `app/customer/checkout/page.tsx`, replace the manual fee-fetching state and effect. Remove these lines:

```typescript
  const [deliveryFeePaise, setDeliveryFeePaise] = useState<number | null>(null);
  const [feeLoadError, setFeeLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadFee() {
      if (!restaurantId) return;
      const { data, error: fetchError } = await supabase
        .from("restaurants")
        .select("delivery_fee_paise")
        .eq("id", restaurantId)
        .single();
      if (cancelled) return;
      if (fetchError) {
        setFeeLoadError(fetchError.message);
        return;
      }
      setDeliveryFeePaise(data ? data.delivery_fee_paise : null);
    }
    loadFee();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);
```

Replace them with the shared hook:

```typescript
  const { deliveryFeePaise, error: feeLoadError } = useDeliveryFee(restaurantId);
```

Add the import at the top of the file (alongside the existing `@/lib/*` imports):

```typescript
import { useDeliveryFee } from "@/lib/use-delivery-fee";
```

Remove the now-unused `useEffect` import if nothing else in the file uses it — check the top of the file: `import { useEffect, useState } from "react";` becomes `import { useState } from "react";` (the file still uses `useState` for `paymentMethod`/`submitting`/`error`).

Update `useCart()` destructuring to pull `orderNote`:

```typescript
  const { restaurantId, restaurantName, items, subtotal, orderNote, clearCart } = useCart();
```

Update the checkout POST body to include it:

```typescript
        body: JSON.stringify({
          restaurantId,
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            selectedOptionIds: i.selectedOptions.map((o) => o.optionId),
            specialInstructions: i.specialInstructions,
          })),
          deliveryAddress: { label, lat, lng },
          paymentMethod,
          expectedTotal: total,
          deliveryNote: orderNote.trim() === "" ? null : orderNote,
        }),
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: succeeds — TypeScript, all routes generated.

- [ ] **Step 4: Commit**

```bash
git add app/api/cart/checkout/route.ts app/customer/checkout/page.tsx
git commit -m "feat: persist the whole-order note through checkout and share the delivery-fee hook"
```

---

### Task 7: Vendor order queue — display the order note

**Files:**
- Modify: `app/api/vendor/orders/route.ts`
- Modify: `app/vendor/orders/page.tsx`

**Interfaces:**
- Consumes: `orders.delivery_note` column from Task 1.
- Produces: nothing — this is the final read path for the order note.

- [ ] **Step 1: Select `delivery_note` in the vendor orders route**

In `app/api/vendor/orders/route.ts`, update the `.select(...)` string:

```typescript
  const { data, error } = await supabaseServer
    .from("orders")
    .select(
      "id, status, subtotal, delivery_fee, total, placed_at, delivery_note, order_items(id, quantity, unit_price, special_instructions, menu_items(name), order_item_options(id, group_name, option_name))"
    )
    .eq("restaurant_id", resolved.restaurantId)
    .order("placed_at", { ascending: false });
```

- [ ] **Step 2: Display it in the vendor orders page**

In `app/vendor/orders/page.tsx`, update the `Order` type to include the new field:

```typescript
type Order = {
  id: string;
  status: string;
  total: number;
  placed_at: string;
  delivery_note: string | null;
  order_items: OrderItem[];
};
```

Add the display, right after the existing `order.order_items.map(...)` list and before the total (`<p className="mt-1 text-sm font-medium">₹{order.total.toFixed(2)}</p>`):

```typescript
            {order.delivery_note && (
              <p className="mt-1 text-sm text-brand-ink-muted">
                Order note: &quot;{order.delivery_note}&quot;
              </p>
            )}
```

This renders nothing for orders placed before this migration (`delivery_note` is `null` for those — Review Focus item 5), and nothing for orders where the customer left the field blank.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: succeeds — TypeScript, all routes generated.

- [ ] **Step 4: Commit**

```bash
git add app/api/vendor/orders/route.ts app/vendor/orders/page.tsx
git commit -m "feat: display the whole-order note on the vendor order queue"
```

---

### Task 8: Live verification across the full flow

**Files:** none (verification only — fix any bug found in the file it belongs to, then re-run this task's steps)

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: nothing — this is the plan's final gate.

Ensure Docker Desktop is running and the local Supabase stack is up before starting.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or confirm one is already running)

- [ ] **Step 2: Drawer open/close behavior**

As a customer, add an item to the cart, click the bottom bar. Confirm a backdrop appears and a panel slides in from the right (not an inline expansion upward). Click the ✕ button — confirm it closes. Reopen, click the backdrop (outside the panel) — confirm it closes. Reopen, press Escape — confirm it closes.

- [ ] **Step 3: Thumbnails**

Add a plain Quick-Add item and a customized (option-group) item to the cart, open the drawer. Confirm both lines show a thumbnail image matching the menu item's photo. With dev tools open, manually set `localStorage.foodhub_cart` to a value whose one item object has no `imageUrl` key at all (simulating a pre-piece-5 cart), reload, open the drawer. Confirm that line shows the placeholder square, not a broken image icon or a crash, and the rest of the cart still loads.

- [ ] **Step 4: Order note**

Type an order note in the drawer's "Order note" field, click elsewhere to blur. Reload the page, reopen the drawer. Confirm the note persisted. Clear the field down to only spaces, blur, reload — confirm it's now empty (not a string of spaces). Type a note over 500 characters — confirm the textarea stops accepting input at 500 (client-side `maxLength`).

- [ ] **Step 5: Fee/total preview matches checkout**

With items in the cart, open the drawer and note the subtotal/delivery fee/total shown in the footer. Navigate to `/customer/checkout` and confirm its subtotal/delivery fee/total match exactly.

- [ ] **Step 6: Place a real order with a note and verify the DB**

Complete checkout with a note in the order-note field. After the order confirms, run:

```bash
docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select id, delivery_note from public.orders order by placed_at desc limit 1;"
```

Expected: `delivery_note` matches what was typed.

- [ ] **Step 7: Vendor order queue displays the note**

Log in as the vendor who owns that restaurant, open `/vendor/orders`. Confirm the order shows an "Order note:" line matching what the customer typed, alongside any per-line special-instructions notes (unchanged from piece 4).

- [ ] **Step 8: Pre-migration order still renders**

Find (or note) an order placed before this piece's migration (any order from piece 4's testing, if the local DB wasn't reset since, has `delivery_note = null` from the `alter table ... add column` with no backfill). Confirm `/vendor/orders` renders that order with no "Order note:" line and no crash. If the local stack was reset since piece 4 (Task 1, Step 2, of this plan resets it), place one order with an empty order-note field instead and confirm the same no-line, no-crash behavior for that order.

- [ ] **Step 9: Screenshot at desktop and mobile width**

Screenshot the open drawer (with at least one thumbnail, options summary, and the order-note field visible) at desktop width and at 390px width. Expected: no layout breakage, drawer is scrollable if content overflows, backdrop covers the full viewport, no console errors.

- [ ] **Step 10: Final build check**

Run: `npm run build`
Expected: full success including the TypeScript phase — this is the plan's final gate before merge.
