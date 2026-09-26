# Uber Eats-style redesign — Piece 6: Checkout visual polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `app/customer/checkout/page.tsx`'s order summary into a full read-only line-item list (mirroring the cart drawer's row style) with a read-only order-note display, and restyle the payment-method picker into icon+card selection — no new API, schema, or cart-store changes.

**Architecture:** Single-file change. `app/customer/checkout/page.tsx` already has everything it needs from `useCart()` (`items`, `orderNote`, `subtotal`, `restaurantName`); this piece only changes what's rendered from that existing data, following the visual patterns `components/CartPanel.tsx` (piece 5) already established for line-item rows and `components/ItemCustomizationModal.tsx` (piece 4) already established for selectable-card styling.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, React Context (`useCart`) — same stack as pieces 1-5, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-26-uber-eats-checkout-polish-design.md`

## Global Constraints

- Money (prices, totals) must use integer-paise-consistent arithmetic where computed — this piece adds no new money computation (line price is `item.price * item.quantity`, the same multiplication the cart drawer already performs for display; `subtotal`/`deliveryFeePaise`/`total` are unchanged from the current page). Do not introduce any new float/paise conversion.
- Run `npm run build` before marking any task done — a missing Suspense boundary or type error has broken this project's production build before.
- Do not restyle the page's `text-red-600` error text or `text-gray-500` loading text to brand tokens — investigated and explicitly rejected in the spec, since `text-red-600` is an established app-wide error-text convention across ~20 files, not a checkout-specific inconsistency. Leave those lines untouched.
- The order-note display and per-line item rows in this piece are **read-only** — no quantity steppers, no remove buttons, no note-editing inputs on this page. Editing stays exclusively the cart drawer's job (piece 5).

## Review Focus

- A cart item with `imageUrl: null` (an item added before piece 5, or the placeholder-path case piece 5's own live-verify already covered) must render the same placeholder square the cart drawer uses, not a broken `<img>` or a crash.
- An item with an empty `selectedOptions` array (a plain Quick-Add item) must not render an empty options line — the conditional must check `.length > 0` the same way the cart drawer already does, not render a line with just a comma-joined empty string.
- An item with `specialInstructions: null` must not render an empty note line — same omit-when-absent pattern as the cart drawer and vendor order-queue already use.
- `orderNote` being an empty string (the default/cleared state, not `null` — piece 5 made `orderNote` a non-nullable string that normalizes blanks to `""`) must be treated as "no note" and render nothing, not a falsy-but-truthy edge case that shows an empty note block.
- Clicking a payment-method card must update `paymentMethod` state and visibly change which card is highlighted — a common bug when converting a radio-row list to a card list is forgetting to keep the underlying `<input type="radio">` (or an equivalent accessible selection mechanism) wired to the same `onChange`, ending up with a card that looks selected but doesn't actually change `paymentMethod`, or vice versa.

---

## File Structure

- **Modify:** `app/customer/checkout/page.tsx` — order-summary line-item list + order-note display (Task 1), payment-method card restyle (Task 2).

---

### Task 1: Order summary — line-item list and order-note display

**Files:**
- Modify: `app/customer/checkout/page.tsx`

**Interfaces:**
- Consumes: `CartItem` shape from `lib/cart-store.tsx` (`lineId`, `name`, `imageUrl`, `price`, `quantity`, `selectedOptions: SelectedOption[]`, `specialInstructions: string | null`) and `orderNote: string` from `useCart()` — all already destructured/available or trivially added to the existing `useCart()` call.
- Produces: nothing new for Task 2 — Task 2 only touches the payment-method section, a separate part of the same file's JSX, and doesn't depend on this task's output beyond both landing in the same file.

- [ ] **Step 1: Add `next/image` import**

At the top of `app/customer/checkout/page.tsx`, add the import (matching `components/CartPanel.tsx`'s usage exactly):

```typescript
import Image from "next/image";
```

- [ ] **Step 2: Replace the order-summary section's heading and body**

Find this block in `app/customer/checkout/page.tsx` (inside the `<aside>`'s `<section>`):

```typescript
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-3 font-semibold text-brand-ink">
              {items.length} item{items.length !== 1 ? "s" : ""} from {restaurantName}
            </h2>
            <div className="flex flex-col gap-1 border-t border-brand-ink-muted/10 pt-3 text-sm text-brand-ink-muted">
              <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
              <p>Delivery fee: ₹{(deliveryFeePaise / 100).toFixed(2)}</p>
              <p className="font-semibold text-brand-ink">Total: ₹{total.toFixed(2)}</p>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="mt-4 w-full rounded-full bg-brand-primary px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Placing order…" : "Place order"}
            </button>
          </section>
```

Replace it with:

```typescript
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-3 font-semibold text-brand-ink">
              {items.length} item{items.length !== 1 ? "s" : ""} from {restaurantName}
            </h2>
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div key={item.lineId} className="flex items-start gap-3">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-lg bg-brand-accent/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-brand-ink">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="shrink-0 text-sm font-medium text-brand-ink">
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                    {item.selectedOptions.length > 0 && (
                      <p className="mt-0.5 text-xs text-brand-ink-muted">
                        {item.selectedOptions.map((o) => o.optionName).join(", ")}
                      </p>
                    )}
                    {item.specialInstructions && (
                      <p className="mt-0.5 text-xs text-brand-ink-muted">
                        &quot;{item.specialInstructions}&quot;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {orderNote && (
              <p className="mt-3 border-t border-brand-ink-muted/10 pt-3 text-xs text-brand-ink-muted">
                Note: &quot;{orderNote}&quot;{" "}
                <span className="text-brand-ink-muted/70">(edit in cart)</span>
              </p>
            )}

            <div className="mt-3 flex flex-col gap-1 border-t border-brand-ink-muted/10 pt-3 text-sm text-brand-ink-muted">
              <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
              <p>Delivery fee: ₹{(deliveryFeePaise / 100).toFixed(2)}</p>
              <p className="font-semibold text-brand-ink">Total: ₹{total.toFixed(2)}</p>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="mt-4 w-full rounded-full bg-brand-primary px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Placing order…" : "Place order"}
            </button>
          </section>
```

Note: `orderNote` is already destructured from `useCart()` on line 19 of the current file (`const { restaurantId, restaurantName, items, subtotal, orderNote, clearCart } = useCart();`), so no change is needed to that line — it's already in scope.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: succeeds — TypeScript, all routes generated.

- [ ] **Step 4: Commit**

```bash
git add app/customer/checkout/page.tsx
git commit -m "feat: show a full line-item breakdown and order note on checkout"
```

---

### Task 2: Payment method — icon + card style

**Files:**
- Modify: `app/customer/checkout/page.tsx`

**Interfaces:**
- Consumes: the existing `PAYMENT_METHODS` constant and `paymentMethod`/`setPaymentMethod` state — unchanged in shape, only the rendering changes.
- Produces: nothing for later tasks — this is the last code task.

- [ ] **Step 1: Add icons to `PAYMENT_METHODS`**

Replace the `PAYMENT_METHODS` constant near the top of the file:

```typescript
const PAYMENT_METHODS = [
  { value: "mock_card", label: "Mock Card" },
  { value: "mock_upi", label: "Mock UPI" },
  { value: "mock_cod", label: "Cash on Delivery" },
] as const;
```

with:

```typescript
const PAYMENT_METHODS = [
  { value: "mock_card", label: "Mock Card", icon: "💳" },
  { value: "mock_upi", label: "Mock UPI", icon: "📱" },
  { value: "mock_cod", label: "Cash on Delivery", icon: "💵" },
] as const;
```

- [ ] **Step 2: Replace the payment-method section's rendering**

Find this block:

```typescript
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-3 font-semibold text-brand-ink">Payment method</h2>
            <div className="flex flex-col gap-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                    paymentMethod === m.value
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-brand-ink-muted/15"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === m.value}
                    onChange={() => setPaymentMethod(m.value)}
                    className="accent-brand-primary"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </section>
```

Replace it with:

```typescript
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-3 font-semibold text-brand-ink">Payment method</h2>
            <div className="flex flex-col gap-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                    paymentMethod === m.value
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-brand-ink-muted/15"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === m.value}
                    onChange={() => setPaymentMethod(m.value)}
                    className="accent-brand-primary"
                  />
                  <span className="text-lg">{m.icon}</span>
                  <span className="font-medium text-brand-ink">{m.label}</span>
                </label>
              ))}
            </div>
          </section>
```

The underlying `<input type="radio">` and its `onChange={() => setPaymentMethod(m.value)}` are kept exactly as they were — only the label's content (icon + styled text instead of bare text) and padding change. This keeps click-to-select working on the whole card (native `<label>`/`<input>` association) without needing a new click handler.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: succeeds — TypeScript, all routes generated.

- [ ] **Step 4: Commit**

```bash
git add app/customer/checkout/page.tsx
git commit -m "feat: restyle checkout payment method picker as icon cards"
```

---

### Task 3: Live verification

**Files:** none (verification only — fix any bug found in the file it belongs to, then re-run this task's steps)

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces: nothing — this is the plan's final gate.

Ensure Docker Desktop is running and the local Supabase stack is up before starting.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or confirm one is already running)

- [ ] **Step 2: Line-item list renders correctly**

As a logged-in customer, add a plain Quick-Add item and a customized (option-group) item with a per-line note to the cart, then navigate to `/customer/checkout`. Confirm the order summary shows one row per item: thumbnail, `{quantity}× {name}`, line price (`price × quantity`), the options summary (only for the customized item), and the per-line note (only for the item that has one). Confirm the plain item shows no options line and no note line.

- [ ] **Step 3: Placeholder image fallback**

With dev tools open, manually add a cart item via `localStorage.foodhub_cart` with `imageUrl: null` (or omit the field entirely), reload `/customer/checkout`. Confirm that row shows the placeholder square, not a broken image icon or a crash, and the rest of the summary still renders.

- [ ] **Step 4: Order note display**

With the cart drawer (piece 5), set an order note, then navigate to `/customer/checkout`. Confirm the note appears below the line-item list as `Note: "..."` with the "(edit in cart)" hint. Clear the note back to empty via the drawer, reload checkout, confirm the note block is gone entirely (not an empty line).

- [ ] **Step 5: Payment method cards**

On the checkout page, confirm all three payment methods show an icon and label. Click each one in turn; confirm the previously-selected card loses its highlight and the newly-clicked one gains it (border + tinted background), and that placing an order actually uses the selected method (check the resulting order's `payments.method` in the DB, or just trust the existing `paymentMethod` state wiring since Step 2 of Task 2 didn't change the `onChange` handler — a quick DB check is still worth doing once).

- [ ] **Step 6: Totals still match the cart drawer**

Note the subtotal/delivery-fee/total shown on this checkout page. Open the cart drawer (bottom bar) without navigating away, and confirm its footer shows the identical three numbers.

- [ ] **Step 7: Place a real order end-to-end**

Complete checkout with the cart from Step 2 (plain + customized items, one with a note, plus a whole-order note set via the drawer). Confirm the order succeeds and redirects to the order confirmation page as before. Verify via psql that the placed order's `delivery_note` and the customized item's `order_item_options`/`special_instructions` match what was shown on the checkout page just before placing it:

```bash
docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select o.id, o.delivery_note, oi.quantity, oi.special_instructions from public.orders o join public.order_items oi on oi.order_id = o.id where o.id = (select id from public.orders order by placed_at desc limit 1);"
```

- [ ] **Step 8: Screenshot at desktop and mobile width**

Screenshot the checkout page (with a multi-item cart including a customized item, an order note set, and a payment method selected) at desktop width and at 390px width. Expected: no layout breakage, the line-item list is legible and doesn't overflow its container awkwardly, payment cards stack sensibly, no console errors.

- [ ] **Step 9: Final build check**

Run: `npm run build`
Expected: full success including the TypeScript phase — this is the plan's final gate before merge.
