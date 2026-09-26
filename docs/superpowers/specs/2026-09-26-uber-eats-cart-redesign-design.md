# Uber Eats-style redesign — Piece 5: Cart redesign

## Context

This is piece 5 of the 6-piece redesign bringing Fresh & Quick's customer
surface toward Uber Eats' web ordering flow (feed → restaurant →
customize → cart → checkout). Pieces 1-4 (design tokens, home/feed,
restaurant page, item customization) are merged to `main`. This piece
covers item 5 from the original scope list: "Cart redesign (slide-out
panel, per-option line items, order note)."

Today's `components/CartPanel.tsx` is a fixed bottom bar that expands
upward in place when clicked (`max-h-80 overflow-y-auto`). It predates
every earlier redesign piece — plain `gray-*`/`red-*` Tailwind colors, no
brand tokens, no images, no delivery-fee/total preview. Per-option line
items and a per-line special-instructions note already exist from piece
4; this piece restyles the panel into a true slide-out drawer, adds line
thumbnails, and adds a new whole-order note field.

## Approved design (2026-09-26, via conversational brainstorming)

### Architecture

`CartPanel` stays one component. The bottom bar (item count + subtotal)
remains the closed-state trigger — clicking it no longer expands in
place; instead it opens a fixed, full-height panel that slides in from
the right edge over a dimmed backdrop (`bg-black/40` or similar). Closing
happens via an ✕ button in the drawer header, clicking the backdrop, or
Escape. No new route — same `open` boolean, now driving a slide
transition (`translate-x-full` → `translate-x-0`) instead of a height
expansion.

The cross-restaurant "clear cart and add?" confirmation from piece 4
(`pendingConflict` in `lib/cart-store.tsx`) is unchanged — it fires
before this drawer ever opens, on the menu page's Quick Add / modal Add
button.

### Data model changes

1. **`CartItem.imageUrl: string | null`** (new field). Populated at both
   `addItem` call sites — `MenuItemRow`'s Quick Add and
   `ItemCustomizationModal`'s Add to cart — from the menu item's existing
   `menu_items.image_url` column (no schema change needed there, it
   already exists and is already fetched by the restaurant page). Cart
   items already in localStorage from before this piece lack the field;
   `normalizeStoredItem` in `lib/cart-store.tsx` must default it to
   `null` for old entries rather than reject/wipe the cart. The drawer
   renders a placeholder square (matching `MenuItemRow`'s existing
   "no image" placeholder pattern) when `imageUrl` is `null`.

2. **`orders.delivery_note text null`** (new column, new migration file
   `supabase/migrations/000000000000XX_order_delivery_note.sql`,
   following the existing numbering sequence). Distinct from
   `order_items.special_instructions` (per-line notes, piece 4). Naming
   mirrors that existing column for consistency.
   - `checkout_place_order` RPC gains a new parameter (`p_delivery_note`
     or similar, nullable) and writes it into the new column.
   - `app/api/cart/checkout/route.ts` accepts an optional
     `deliveryNote: string | null` in the request body, trims it,
     caps it at a reasonable length (500 chars, matching piece 4's
     `special_instructions` cap for consistency), and passes it to the
     RPC.
   - `lib/cart-store.tsx` gains `orderNote: string` state and a
     `setOrderNote(text: string)` action, persisted in the same
     localStorage blob as `items`/`restaurantId`, cleared by
     `clearCart()` and after a successful order placement (same lifecycle
     as the cart itself).
   - `app/customer/checkout/page.tsx` reads `orderNote` from the cart
     store and includes it in the checkout POST body.
   - `app/vendor/orders/page.tsx` displays the order-level note (if
     present) alongside the existing per-line special-instructions
     display, visually distinguished as "Order note:" vs the per-item
     notes.

3. **Shared `useDeliveryFee(restaurantId: string | null)` hook** (new,
   `lib/use-delivery-fee.ts` or colocated in `lib/cart-store.tsx` —
   implementer's call at plan time). Extracts the existing inline
   `supabase.from("restaurants").select("delivery_fee_paise")` effect
   currently duplicated only in `app/customer/checkout/page.tsx` into a
   reusable hook returning `{ deliveryFeePaise: number | null, loading:
   boolean }`. The checkout page switches to this hook (dropping its own
   copy of the fetch); the new drawer uses the same hook for its footer
   preview. This guarantees the drawer's preview total and the checkout
   page's real total can never drift from two independent
   implementations of the same query.

### Drawer contents (top to bottom)

1. **Header:** restaurant name (from `restaurantName` in cart store) +
   ✕ close button.
2. **Scrollable line list:** each line shows (in order) a thumbnail
   (`imageUrl` or placeholder), item name, selected-options summary
   (unchanged from piece 4 — comma-joined option names), the existing
   per-line special-instructions text input, a quantity stepper
   (−/count/+), and a Remove button. Same underlying data and actions
   (`updateQuantity`, `removeItem`, `setSpecialInstructions`) as today —
   restyled with brand tokens (`brand-*` classes from piece 1) and the
   new thumbnail.
3. **Order note:** a single textarea below the line list, placeholder
   "Add a note for the whole order (e.g. gate code, leave at door)",
   bound to `orderNote`/`setOrderNote`, capped at 500 characters
   client-side (`maxLength`) to match the server-side cap — closing a
   gap piece 4 left open for per-line notes (`CartPanel`'s existing note
   input gets the same `maxLength=500` added as part of this piece's
   restyle, since it's the same input pattern).
4. **Footer summary:** subtotal (existing `subtotal` from cart store),
   delivery fee (from `useDeliveryFee`), estimated total (sum of the
   two) — all in ₹, matching the checkout page's number formatting.
   While the fee is loading, show subtotal only with the fee row in a
   loading/skeleton state rather than blocking the whole drawer.
5. **Actions:** "Checkout" button (same `Link` to
   `/customer/checkout` as today) and a "Clear cart" text action.

### Out of scope for this piece

- Any change to the checkout page's own layout/visual design — that is
  piece 6.
- Any change to how options are selected (piece 4's
  `ItemCustomizationModal` is unchanged).
- Editing selected options from the cart drawer (removing and re-adding
  the item remains the only way to change a customization) — not in the
  original 6-piece scope list, and Uber Eats itself routes an "edit" tap
  back through the item modal rather than editing inline in the cart.

## Testing

- `npm run build` clean (TypeScript + all routes) — required before
  marking any task done, per this project's standing rule.
- Live verification (browser): drawer opens via the bottom-bar trigger
  and closes via the ✕ button, a backdrop click, and Escape; thumbnails
  render correctly for a Quick-Add plain item, a piece-4 customized
  item, and (via a manually-crafted localStorage entry) an old cart line
  with no `imageUrl`, confirming the placeholder path and no crash; the
  order-note textarea enforces its 500-char cap and its value survives a
  page reload (localStorage) the same way per-line notes do; placing a
  real order round-trips the order note into `orders.delivery_note` and
  it displays on `/vendor/orders`; the drawer's subtotal/fee/total
  exactly match the checkout page's numbers for the same cart (same
  `useDeliveryFee` call, so this should hold by construction, but verify
  live since it's user-facing money).
