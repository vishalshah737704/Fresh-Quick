# Uber Eats-style redesign — Piece 6: Checkout visual polish

## Context

This is piece 6, the final piece, of the 6-piece redesign bringing Fresh &
Quick's customer surface toward Uber Eats' web ordering flow (feed →
restaurant → customize → cart → checkout). Pieces 1-5 (design tokens,
home/feed, restaurant page, item customization, cart redesign) are merged
to `main`.

`app/customer/checkout/page.tsx` already uses the piece-1 brand tokens
(`brand-primary`/`brand-ink`/`brand-surface`/etc.) and a 2-column
sticky-sidebar layout, but its order summary is a bare collapsed count
("N items from X") with no breakdown, the payment-method picker is plain
radio rows, and the order note added in piece 5 isn't shown anywhere on
this page at all. This piece brings the checkout page's level of detail
and visual treatment up to what pieces 3-5 already established elsewhere
(the restaurant page's menu rows, the cart drawer's line-item rows).

## Approved design (2026-09-26, via conversational brainstorming)

### Architecture

Single-file change: `app/customer/checkout/page.tsx` is restyled in
place. No new API routes, no schema changes, no new cart-store fields —
everything needed (`items`, `orderNote`, `subtotal`, `restaurantName`) is
already available from `useCart()`. If the order-summary line-item JSX
grows unwieldy inside the page component, extracting a small presentational
row component is acceptable (implementer's call at plan time), but no new
component is mandated by this spec.

An investigated-and-rejected idea: restyling the page's loading/error
text (`text-gray-500`/`text-red-600`) to brand tokens. `text-red-600` for
inline error messages is used consistently across ~20 files app-wide
(admin, vendor, delivery, and every customer page) — it is the
established error-text convention for this whole codebase, not a
checkout-specific leftover. Changing it only on this page would make
checkout *inconsistent* with every other page, not more consistent. Out
of scope for this piece; left untouched.

### Order summary — full line-item list

Replace the current `{items.length} item{s} from {restaurantName}`
one-liner with a full breakdown, one row per cart item, in the same
visual language as the cart drawer's rows (`components/CartPanel.tsx`,
piece 5): a thumbnail (`item.imageUrl`, falling back to the same
placeholder square pattern used in the cart drawer and `MenuItemRow` when
`null`), the item name, its selected-options summary (comma-joined option
names, only shown when non-empty), its per-line special-instructions note
(only shown when set, matching the cart drawer's convention), the
quantity, and the line's total price (`item.price * item.quantity`,
formatted the same way the rest of the page formats money). This list is
**read-only** — no quantity steppers, no remove buttons, no note-editing
inputs. Checkout is a review-and-confirm surface; changing the cart stays
the drawer's exclusive job (consistent with the drawer having quantity/
remove controls and checkout not needing them, the same division that
already exists today between the drawer and this page for editing vs.
reviewing).

Below the line-item list and above the subtotal/fee/total footer: if
`orderNote` is non-empty, show it read-only (e.g. a small "Note: ..."
line), with a short hint that it can be changed from the cart (e.g. "Edit
in cart" as plain text, not a new UI affordance — the existing cart-drawer
trigger already sits in the persistent bottom bar on this page, so no new
navigation is needed). If `orderNote` is empty, show nothing (matches the
cart drawer's and vendor order-queue's existing convention of omitting
empty/absent notes entirely, established in piece 5).

The subtotal/delivery-fee/total footer keeps its current three lines and
values unchanged — only its visual presentation (spacing, weight) may be
adjusted to sit naturally below the new line-item list.

### Payment method — icon + card style

Replace the current plain radio-row list with a selectable-card style:
each of the three payment methods (Mock Card, Mock UPI, Cash on Delivery)
gets a small icon and renders as a card that highlights (border +
tinted background) when selected, using the same
`border-brand-primary bg-brand-primary/5` selected-state pattern the
current radio rows already use (just applied to a richer card layout
instead of a plain row) — this matches the accent-colored selected-state
pattern already established in `ItemCustomizationModal` (piece 4) for its
option radios/checkboxes. Icons are simple inline characters/emoji (e.g.
💳 for card, 📱 for UPI, 💵 for cash) rather than a new icon library
dependency, consistent with how this codebase already uses emoji for
other simple iconography (e.g. the 🟢/🔴 veg indicators, the 🏠/🍽️/🧾/👤
bottom-nav icons).

### Out of scope for this piece

- Any change to the delivery-address section beyond restyling to match
  the new visual density (address *selection*/editing is handled by the
  header's location picker elsewhere in the app, not this page — this
  page only ever displayed the current address as read-only text, and
  that stays true).
- Any change to how the order note is *edited* — it stays exclusively a
  cart-drawer affordance (piece 5); checkout only displays it.
- Any schema, API route, or cart-store change — this is a display-only
  restyle of data already available on the page.
- The "no `<a href>` tags" / accessibility / RLS-policy classes of
  finding that have bitten earlier pieces don't apply here (no new links,
  no new tables) but the final review should still check for them per
  standing practice.

## Testing

- `npm run build` clean (TypeScript + all routes) — required before
  marking any task done, per this project's standing rule.
- Live verification (browser): checkout page shows one row per cart item
  with a thumbnail, name, options summary (when present), per-line note
  (when present), quantity, and line price, for a cart containing both a
  plain and a customized item; a cart item with no `imageUrl` (an old
  localStorage cart, or simply an item added before piece 5 without an
  image) shows the placeholder, not a broken image or a crash; the
  order note shows when set and is absent when empty, with cart contents
  built the same way piece 5's own live-verify pass constructed them;
  payment-method cards show icons and the selected state highlights
  correctly and updates on click; the subtotal/fee/total footer's values
  are unchanged and still match the cart drawer's preview exactly (same
  `useDeliveryFee` hook, so this should hold by construction — verify
  live since it's user-facing money); placing a real order still
  succeeds end-to-end with the new layout; screenshots at desktop and
  390px width, confirming no layout breakage and the line-item list
  scrolls sensibly if it overflows.
