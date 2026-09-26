# Uber Eats-style redesign — Piece 4: Item Customization

## Context

Piece 4 of the 6-piece Uber Eats-style redesign (pieces 1-3 merged:
design tokens, home/feed rebuild, restaurant page rebuild). This piece
adds real item customization — option groups (e.g. size, add-ons) with
per-option price deltas, and a per-cart-line special-instructions note —
on top of the restaurant page piece 3 shipped. Piece 3's corner "Quick
Add" button (`components/MenuItemRow.tsx`) was explicitly restyle-only,
deferring true customization to this piece; this spec is where that
customization actually gets built.

Unlike pieces 1-3, this piece touches real schema, real money
computation (the checkout route's `expectedTotal` reprice guard), and
the cart's core data model (`lib/cart-store.tsx`) — comparable in stakes
to piece 2 (home/feed rebuild), which added `delivery_fee_paise` and
rewired checkout's fee source.

## Approved design

### Schema (new migration `00000000000017_item_customization.sql`)

```sql
create table public.menu_item_option_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null check (max_select >= 1 and max_select >= min_select),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.menu_item_options (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references public.menu_item_option_groups(id) on delete cascade,
  name text not null,
  price_delta_paise integer not null default 0 check (price_delta_paise >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.order_items
  add column special_instructions text;

create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  -- set null (not cascade) on delete: an order's history must survive a
  -- vendor later deleting the option that was selected at order time.
  menu_item_option_id uuid references public.menu_item_options(id) on delete set null,
  group_name text not null,
  option_name text not null,
  price_delta_paise integer not null check (price_delta_paise >= 0)
);
```

`group_name`/`option_name`/`price_delta_paise` on `order_item_options`
are a **snapshot at order time**, the same pattern `order_items.unit_price`
already uses — a vendor renaming or deleting an option later must never
change what a past order's receipt shows.

A group with `min_select = 0` is optional; `min_select >= 1` is
required. `max_select = 1` renders as radio buttons on the customer
side; `max_select > 1` renders as checkboxes capped at that count.
`price_delta_paise` follows piece 2's `delivery_fee_paise` precedent
(integer paise), not `menu_items.price`'s older numeric-rupee column —
**all money computation happens in paise in TypeScript**, converting to
a rupee float only at the Supabase RPC call boundary, exactly matching
the checkout route's existing `subtotalPaise`/`totalPaise` pattern.
Non-negative only (Vishal's ruling) — no discount-style options in this
piece.

### RLS

`menu_item_option_groups` and `menu_item_options` get the same
public-read policy `menu_items` already has (customers need to browse
them un-authenticated). `order_item_options` gets the same
owner/vendor-scoped read policies `order_items` already has (mirror,
don't invent a new shape). **No RLS write policy on any of the three** —
every write goes through new service-role vendor API routes, per this
project's standing rule against RLS write policies on service-role-only
tables.

### Customer flow

- The restaurant page's menu query (`app/customer/restaurants/[id]/
  page.tsx`) extends its `menu_items` select to a nested
  `menu_item_option_groups(id, name, min_select, max_select, sort_order,
  menu_item_options(id, name, price_delta_paise, sort_order))`, sorted
  client-side by `sort_order` after fetch (not relying on Supabase's
  nested-relation ordering support).
- `MenuItemRow`'s corner `+` button: if the item has **zero** option
  groups, it behaves exactly as piece 3 shipped it (instant `addItem`,
  no modal). If it has **one or more** option groups, clicking it opens
  a new `ItemCustomizationModal` instead of adding directly — this is
  the only branch point; whether every group is optional doesn't matter,
  having any group at all routes through the modal.
- `ItemCustomizationModal` (new component): shows the item name/price,
  one section per option group (radio for `max_select === 1`, checkboxes
  capped at `max_select` otherwise), a running total (base price +
  selected deltas) × a quantity stepper, and an "Add to cart" button
  disabled until every group with `min_select > 0` has a valid selection
  count. Does **not** include a special-instructions field (see below).
  On submit, builds the cart line and calls `addItem`.

### Cart identity (`lib/cart-store.tsx`)

```typescript
export type SelectedOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDeltaPaise: number;
};

export type CartItem = {
  lineId: string; // menuItemId + a stable ordering of selected option ids
  menuItemId: string;
  name: string;
  price: number; // per-unit price in rupees, INCLUDING selected option deltas
  quantity: number;
  selectedOptions: SelectedOption[];
  specialInstructions: string | null;
};
```

`lineId` is computed by a pure helper:
`` `${menuItemId}::${[...selectedOptions].map(o => o.optionId).sort().join(",")}` ``
— two adds of the same item with the same selections merge (quantity
sums, matching today's behavior); different selections become separate
cart lines. Quick Add (zero option groups) always produces
`selectedOptions: []`, so its `lineId` collapses to `menuItemId` alone —
byte-identical merge behavior to today for every item that has no
option groups.

`addItem`/`updateQuantity`/`removeItem` key on `lineId` instead of
`menuItemId` (signature change: `updateQuantity(lineId, quantity)`,
`removeItem(lineId)`). A new `setSpecialInstructions(lineId, text)`
action is added. `pendingConflict`'s carried `item: CartItem` needs no
shape change beyond the type itself already changing.

**Special instructions live outside the modal, edited per-line in
`CartPanel` for every item — simple or customized** (Vishal's explicit
ruling: Quick Add stays a true one-tap add with no interruption; the
note is opt-in, added afterward from the cart).

**Old localStorage carts** (pre-piece-4 shape, missing `lineId`/
`selectedOptions`/`specialInstructions`) are **synthesized**, not wiped:
`loadStoredCart`'s validation accepts the old shape too and fills in
`lineId: menuItemId`, `selectedOptions: []`, `specialInstructions: null`
for any item missing them, so a customer's in-progress cart survives the
deploy.

### `CartPanel`

- Iterate `items` keyed by `lineId`.
- Under the item name, if `selectedOptions.length > 0`, show a small
  muted summary line joining `optionName`s (e.g. "Large, Extra cheese").
- A small "Add a note" text input per line (or the existing note shown
  editable) calling `setSpecialInstructions(lineId, text)`. This is a
  functional addition only — the panel's overall visual redesign (a
  slide-out panel) stays piece 5's scope; this piece touches `CartPanel`
  only as much as the new per-line data requires.
- Quantity +/- and Remove buttons now pass `lineId`.

### Checkout (`app/api/cart/checkout/route.ts` + `app/customer/checkout/page.tsx`)

- Checkout page sends each cart line as
  `{ menuItemId, quantity, selectedOptionIds: string[], specialInstructions: string | null }`.
- The route re-fetches each referenced `menu_item_id`'s real option
  groups/options from the DB (never trusts the client's prices) and, per
  line:
  - every id in `selectedOptionIds` must belong to an option group
    of that specific menu item (400 otherwise);
  - every group with `min_select > 0` must have a selected-count within
    `[min_select, max_select]`, and no group's selected count may exceed
    its own `max_select` (400 otherwise, same status/shape as the
    existing quantity-bounds check);
  - unit price is recomputed server-side in paise: base item price
    (paise-rounded, matching the existing `priceById` pattern) + sum of
    the selected options' `price_delta_paise`.
- The existing `expectedTotal` reprice guard (409 on mismatch) now
  naturally covers option prices too, since it compares against the
  server's fully-recomputed total — no separate guard needed.
- `checkout_place_order` RPC gains a nested `options` array per item
  entry in `p_items` (each `{option_id, group_name, option_name,
  price_delta_paise}`, mirroring the snapshot columns above) and a
  `special_instructions` field per item. Inside the existing per-item
  loop, after inserting the `order_items` row (capturing its new id via
  `returning id into`), a nested loop inserts one `order_item_options`
  row per selection — same transaction, same atomicity guarantee the
  RPC already provides for the rest of checkout.

### Vendor order queue (`app/api/vendor/orders/route.ts` + `app/vendor/orders/page.tsx`)

The existing nested select
(`order_items(id, quantity, unit_price, menu_items(name))`) extends to
also pull `order_item_options(group_name, option_name)` and
`special_instructions`; the vendor order queue's existing
`{quantity}× {name}` line gets the selected options and note appended
(e.g. `2× Cheeseburger — Large, Extra cheese — "no pickles"`) so a
vendor actually knows what to prepare. **Customer order-confirmation
page does not display line items at all today** (a pre-existing gap,
not introduced by this piece) — left out of scope rather than expanded,
per Vishal's explicit call.

### Vendor option-group management UI

Each menu item in `/vendor/menu` gets its own expandable "Manage
options" panel — a separate toggle from the existing name/price edit
form, not nested inside it. The panel lists the item's option groups
(name, min/max), each with its options (name, price delta in rupees)
and delete buttons, plus an inline "add group" form (name, min select,
max select) and, within each group, an inline "add option" form (name,
price delta rupees). No drag-reordering in this piece — `sort_order` is
just assigned in creation order (YAGNI; add reordering later only if
actually needed).

Five new vendor API routes, all following the existing
`resolveVendorRestaurant`/ownership-check pattern from
`app/api/vendor/menu-items/route.ts` (a vendor may only create/edit/
delete groups and options on their own restaurant's menu items — the
route must verify this via a join, not trust a client-supplied id
alone):

- `GET/POST /api/vendor/menu-items/[id]/option-groups` — list/create
  groups for a menu item.
- `PATCH/DELETE /api/vendor/option-groups/[groupId]` — edit/delete a
  group (delete cascades to its options via the FK).
- `POST /api/vendor/option-groups/[groupId]/options` — create an option
  in a group.
- `PATCH/DELETE /api/vendor/options/[optionId]` — edit/delete an option.

## Scope

**In scope:** everything above — schema, RLS, restaurant-page fetch,
`ItemCustomizationModal`, cart-store rewrite (`lineId`, special
instructions), `CartPanel` functional additions, checkout route + RPC
changes, vendor order-queue display, vendor option-group management UI
and its 5 API routes.

**Out of scope (later pieces / explicitly deferred):**
- `CartPanel`'s visual redesign into a slide-out panel — piece 5.
- Checkout page's visual polish — piece 6.
- Customer order-confirmation page gaining a line-items display at
  all — pre-existing gap, not this piece's to fix.
- Drag-reordering of option groups/options in the vendor UI — YAGNI for
  now.
- Discount-style (negative) price deltas — explicitly ruled out.

## Testing plan

1. `npm run build` (full output including the TypeScript phase) after
   every task.
2. Vendor flow: create an option group with `min_select=1, max_select=1`
   (e.g. Size) and one with `min_select=0, max_select=3` (e.g. Add-ons)
   on a real menu item, add options with price deltas to each, confirm
   they persist and are ownership-scoped (a second vendor account cannot
   see or edit another restaurant's groups via the API directly).
3. Customer flow: load that restaurant, confirm the item's corner button
   opens the modal (not instant add); confirm Add is disabled until the
   required group has a selection; select options, confirm the running
   total updates correctly; add to cart twice with the same selections
   (confirm it merges into one line, quantity 2) and once with different
   selections (confirm a second, separate cart line appears).
4. Cart panel: confirm the selected-options summary line renders per
   line, add a special-instructions note to both a customized and a
   plain (no-options) line, confirm both persist through a page reload
   (localStorage) and are distinct per line.
5. Checkout: place a real order with a customized item, verify via
   direct Postgres query that `order_items.special_instructions` and
   the corresponding `order_item_options` rows match exactly what was
   selected, and that `unit_price` matches base + deltas. Attempt a
   checkout with a `selectedOptionIds` value that doesn't belong to that
   menu item (crafted request, not through the UI) and confirm a 400,
   not a silently-accepted or mispriced order. Attempt a checkout that
   skips a required group's minimum and confirm a 400.
6. Vendor order queue: confirm the placed order's selected options and
   note are visible on `/vendor/orders`.
7. Backward compatibility: manually seed an old-shape cart into
   `localStorage` (missing `lineId`/`selectedOptions`/
   `specialInstructions`) before loading the customer app, confirm it
   loads without clearing and the existing item(s) are still addable/
   removable.
8. Screenshot the modal and the updated cart panel at desktop and 390px
   width, per the project's established visual-smoke-test pattern.

## Open questions for the plan

None — every design decision above was confirmed with Vishal during
this brainstorm (vendor UI included, full min/max per group, special
instructions on every item edited in the cart rather than the modal,
non-negative price deltas only).
