# Account-scoped cart persistence

## Context

Today the customer cart (`lib/cart-store.tsx`) persists unconditionally in
browser `localStorage`, regardless of login state — a deliberate Phase 2
decision so anonymous shoppers don't lose their cart on refresh. Vishal
now wants the opposite behavior for anonymous users and true cross-device
persistence for logged-in ones:

- **Not logged in**: reloading the page must always start with an empty
  cart. No anonymous persistence at all.
- **Logged in**: the cart must survive reload and re-login, and follow the
  account across browsers/devices (server-side storage, not just
  localStorage).
- **Anonymous → login transition** (same tab, no reload): if the account
  has no saved server cart yet, the anonymous cart in progress becomes the
  account's saved cart. If the account already has a saved server cart,
  that server cart wins and the anonymous one is discarded.

## Scope

**In scope:**
- New `carts` table (one row per customer) + RLS policies.
- `GET /api/cart` and `PUT /api/cart` routes for loading/saving.
- `lib/cart-store.tsx` rewritten to source of truth from the server when
  logged in, and to hold state in memory only (no localStorage) when
  logged out.
- Login-time load/merge logic per the rules above.
- Logout clears the in-memory cart.

**Out of scope:**
- Any change to cart shape (`CartItem`, options, notes), the
  single-restaurant conflict-dialog rule, or checkout itself — all
  unchanged, only the persistence layer moves.
- Vendor/delivery/admin carts — n/a, customer-only feature.

## Data model

New migration, `carts` table:

```sql
create table public.carts (
  user_id uuid primary key references public.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  store_name text,
  items jsonb not null default '[]'::jsonb,
  order_note text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.carts enable row level security;

create policy "customer_can_read_own_cart" on public.carts
  for select using (auth.uid() = user_id);

create policy "customer_can_upsert_own_cart" on public.carts
  for insert with check (auth.uid() = user_id);

create policy "customer_can_update_own_cart" on public.carts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "customer_can_delete_own_cart" on public.carts
  for delete using (auth.uid() = user_id);
```

`items` stores the same JSON shape as today's `CartItem[]` — no
transformation needed between client state and the stored column.
Direct owner-scoped RLS (not service-role-only) is correct here: a
customer legitimately writes their own cart directly from the client,
unlike vendor/admin tables where all writes must go through a validating
API route.

## Architecture

- `GET /api/cart`: verifies the bearer token via
  `supabaseServer.auth.getUser(token)` (same pattern as
  `/api/cart/checkout`), selects the caller's own `carts` row. Returns
  `{ cart: null }` if no row exists yet, or
  `{ cart: { storeId, storeName, items, orderNote } }` if one does.
- `PUT /api/cart`: same auth, upserts the caller's row with the posted
  `{ storeId, storeName, items, orderNote }`. An empty cart (`items: []`)
  still upserts a row with `store_id: null` — this is how "logged-in user
  cleared their cart" is distinguished from "no server cart ever saved",
  which matters for the merge rule below.
- `lib/cart-store.tsx`:
  - Tracks whether a Supabase session exists (via
    `supabase.auth.onAuthStateChange`, mirroring the pattern the
    login-gated hooks already use elsewhere in this app).
  - **No session**: state lives in `useState` only. No `localStorage`
    read on mount, no write on change. A page reload always starts empty.
  - **Session appears (login, or a session already existed on mount)**:
    call `GET /api/cart`.
    - If it returns an existing row → replace in-memory cart with it
      (discarding whatever was there before, per the "server wins"
      rule — this covers both "just logged in with an anonymous cart in
      progress" and "reloaded while already logged in").
    - If it returns `{ cart: null }` → keep whatever is currently in
      memory (the anonymous cart just built, if any) and immediately
      `PUT` it to the server so it becomes the account's saved cart.
  - **While a session exists**: every mutation (`addItem`,
    `updateQuantity`, `removeItem`, `setSpecialInstructions`,
    `setOrderNote`, `clearCart`) triggers a debounced `PUT /api/cart`
    (e.g. 500ms) so rapid quantity clicks don't spam the API.
  - **Session disappears (logout)**: clear in-memory cart state
    immediately. Do not call the API (nothing to save — the account's
    last state is already persisted from the most recent mutation).
  - `localStorage` is no longer used at all — remove `STORAGE_KEY`,
    `loadStoredCart`, `normalizeStoredItem`, and the persistence
    `useEffect`. The existing pre-piece-4 shape migration inside
    `normalizeStoredItem` is dropped entirely since there's no more
    localStorage data to migrate from (server rows are always written in
    the current shape going forward).

## Testing plan

1. `npm run build`.
2. Not logged in: add an item, reload → cart empty (no `carts` row
   created, since nothing ever authenticates to write one).
3. Log in with an account that has no saved cart, with an anonymous cart
   already built in this tab → cart persists into the account (verify a
   `carts` row now exists with those items).
4. Log out → cart clears immediately in the UI.
5. Log back in with that same account (fresh tab, cleared storage) →
   cart is restored from the server.
6. Simulate cross-device: log in as an account with an existing saved
   cart from a `psql` insert, while this browser tab independently holds
   a *different* anonymous cart → after login, the server cart shows, the
   anonymous one is gone.
7. While logged in, add/remove items, reload → latest state persists
   (confirms the debounced `PUT` actually lands before/across reloads in
   normal use — test with realistic click timing, not instant reload
   mid-keystroke).

## Open questions for the plan

None — fully specified after brainstorming approval.
