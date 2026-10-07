# C3 — Favorites, recent stores and one-tap reorder (design)

Date: 2026-10-07. Sub-project 1 of 4 in the "High-impact Customer enhancements" programme
(order: C3, C1 reviews, C2 coupons and referral, C4 notifications). Source: `docs/Enhancements.docx`, item C3.

## 1. Goal and success criteria

A returning customer reaches a repeat order in two taps, on web and on the phone.

- A signed-in customer can heart or un-heart a store; hearts persist on the account and show on both clients.
- Home shows "Order again" (last 3 distinct stores ordered from) and a Favorites filter.
- Past orders have a Reorder button that refills the cart at today's prices; unavailable lines are skipped and listed; a store that is closed or suspended is refused.
- Adding from a different store than the cart replaces the cart and says so (existing Zippy/cart rule, no modal).

Not in scope: vendor-facing "favorited by N" counts, favorite dishes, sharing, notifications about favorites.

## 2. Data

Migration `00000000000036_favorite_stores.sql`:

- `public.favorite_stores (user_id uuid references public.users(id) on delete cascade, store_id uuid references public.stores(id) on delete cascade, created_at timestamptz default now(), primary key (user_id, store_id))`; index on `store_id`.
- RLS enabled, **no policies** (service-role only). Reads and writes go through API routes; no client write policy (project rule on unused RLS write policies).
- Deleting a customer (Reset Data) cascades.

## 3. API (all customer-only, identity from the verified Bearer session token)

- `GET /api/customer/favorites` returns `{ storeIds: string[] }`.
- `PUT /api/customer/favorites/[storeId]` is idempotent add; `DELETE` is idempotent remove. A store id that does not exist returns 404; a suspended store can still be un-favorited.
- `GET /api/customer/reorder-options` returns up to 3 distinct stores from the customer's most recent non-cancelled/non-rejected orders: `{ storeId, storeName, imageUrl, lastOrderId, lastOrderedAt, itemCount }`.
- `POST /api/customer/orders/[id]/reorder` loads the order **filtered on the customer id** (another customer's id returns 404 "not found"), re-reads the live products, and returns `{ storeId, storeName, lines: CartLineData[], skipped: {name, reason}[] }` or an error (`store closed`, `none can be reordered`).

Identity rule: never take a customer id from the body or from model/tool input.

## 4. Shared reorder logic

`buildReorderCard` in `lib/zippy/actions.ts` already turns an order's lines plus live products into valid `CartLineData` with skip reasons. Extract its loop into a pure exported `buildReorderLines(source, products, deps)` returning `{ items, skipped, storeName }`; `buildReorderCard` calls it (Zippy behaviour and its tests must not change). The new reorder route uses the same function, with the same product loader the Zippy tool uses, so web, phone and Zippy agree on prices and skip reasons. Money stays in integer paise.

## 5. Clients

Web (`app/customer/**`, `components/`):

- `components/FavoriteHeart.tsx` on `RestaurantCard` and the store page header; optimistic toggle, rolled back on failure; signed-out tap goes to login with a validated redirect.
- A `FavoritesProvider` hook (fetch once after sign-in, cleared on sign-out/session epoch change).
- Home: "Order again" row (cards with a Reorder button) above the cuisine rows; a "Favorites" chip in the chip row that filters the feed. Rows with no data are hidden, not empty.
- Orders list and order detail: "Reorder" button. Click calls the reorder route, then `addItems(storeId, storeName, lines, true)` (atomic; not `clearCart()` then `addItem()`), then opens the cart panel. Skipped lines are shown in a short notice; a cross-store replace says "Replaced the N items from <store>".

Mobile (`mobile/`):

- Replace the local-only hearts in `mobile/components/StoreCard.tsx` and `mobile/src/app/customer/store/[id].tsx` with the real favorites store (`mobile/lib/favorites-store.tsx`).
- Order again row on `home.tsx`; Reorder on `orders.tsx` and `orders/[id]`.
- Pure helpers shared byte-identical with web (`lib/favorites-model.ts` to `mobile/lib/`), guarded in `tests/mobile-parity.test.mjs`.

## 6. Cross-module and other dependencies

- Vendor, Delivery, Admin, n8n: none for C3.
- Reset Data standing phrase: add `favorite_stores` to the customer-data cascade note (it cascades from `users`, so the SQL is unchanged; the note in CLAUDE.md is updated).
- Zippy knowledge: add favorites and Reorder Q&A to `knowledge/customer/ordering-web.md` and `ordering-mobile.md`; re-ingest and re-run `node scripts/zippy-eval.mjs` after merge.
- Manuals: web and mobile edited in place (python-docx), TOCs renumbered if a page start moves.

## 7. Error handling

- Favorites toggle failure: heart reverts, toast "Could not update favorite".
- Reorder: store closed/suspended gives a clear message and no cart change; zero reorderable lines gives an error and no cart change; network failure leaves the cart untouched.
- Stale cart store: reorder replaces (disclosed), never merges across stores.

## 8. Testing and verification

- Unit tests (`tests/*.test.mjs`): `buildReorderLines` (skips, options changed, price today, caps), favorites model, reorder-options selection (distinct, order, excludes cancelled/rejected), mobile parity.
- Zippy regression: existing reorder-card tests still pass.
- Redaction/authorization tests: another customer's order id returns "not found"; a favorites call without a token returns 401; a vendor/partner/admin token is refused.
- Live (mandatory, real browser with Playwright and a real DB): heart toggle persists after reload; Order again row and Favorites chip; Reorder with a price change, an unavailable dish, a closed store, and a cross-store replace with no modal; double click adds once. `npm run build` and `tsc` clean.
- Phone: heart persists after app restart, Reorder fills the cart (Android emulator, then Vishal's iPhone).
- No real Gmail: tests only place orders when needed, and only after the Gmail nodes are checked (see CLAUDE.md test-email rule).

## 9. Risks

- Home layout change can hide stores (see the restructuring lesson): the Favorites chip is a filter over the full list and the default view is unchanged.
- Mobile/web drift: byte-identical copies plus parity test.
- A required-option dish whose options changed is skipped, never silently added without options.
