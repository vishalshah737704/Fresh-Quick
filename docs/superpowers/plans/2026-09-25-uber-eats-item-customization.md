# Uber Eats-style redesign — Piece 4: Item Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real menu-item customization — vendor-defined option groups (size/add-ons) with per-option price deltas, and a per-cart-line special-instructions note — replacing nothing (Quick Add stays for simple items) and extending checkout's money path to price and persist selections safely.

**Architecture:** A new migration adds `menu_item_option_groups`/`menu_item_options` (vendor-owned, publicly readable) and `order_item_options` (a snapshot table mirroring `order_items.unit_price`'s existing snapshot pattern) plus `order_items.special_instructions`, and rewrites `checkout_place_order` to insert option selections inside its existing per-item loop. The cart's identity moves from `menuItemId` to a computed `lineId` (`menuItemId` + sorted selected option ids) so two different customizations of the same dish become separate cart lines. All money math (base price + option deltas) happens in integer paise in TypeScript, converting to a rupee float only at the RPC boundary — the same pattern the checkout route already uses for the delivery fee. The customer-facing option-selection UI is a new modal (`ItemCustomizationModal`), triggered from `MenuItemRow`'s corner button only when an item has option groups; items with none keep piece 3's exact instant Quick Add.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + PostgREST via `@supabase/supabase-js`), TypeScript, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-09-25-uber-eats-item-customization-design.md`

## Global Constraints

- `price_delta_paise` on `menu_item_options` is integer paise, non-negative only (`check (price_delta_paise >= 0)`) — no discount-style options, per Vishal's explicit ruling.
- All money computation (base price + selected option deltas) happens in **paise** in TypeScript; convert to a rupee float only where a Supabase RPC/insert numeric column requires it — never a raw float multiplication in between, matching this project's standing money rule.
- `order_item_options.group_name`/`option_name`/`price_delta_paise` are a **snapshot at order time** (same pattern as `order_items.unit_price`) — a later vendor edit or delete of the option must never change what a past order shows. `menu_item_option_id` uses `on delete set null`, never cascade, for exactly this reason.
- No RLS write policy on `menu_item_option_groups`, `menu_item_options`, or `order_item_options` — every write goes through a service-role API route, per this project's standing rule against RLS write policies on service-role-only tables.
- Every new/modified vendor API route must verify ownership via a join back to the authenticated vendor's own `restaurantId` (the `resolveVendorRestaurant` pattern already used by `app/api/vendor/menu-items/route.ts`) — never trust a client-supplied group/option id alone.
- The checkout route must **re-fetch and re-validate every selected option server-side** — never trust the client's `selectedOptionIds`, price, or `expectedTotal` on their own.
- `npm run build` must pass — full output including the "Running TypeScript ..." phase — after every task.
- No automated test framework exists in this project; verification is `npm run build` plus a live Playwright/psql walkthrough against the real local Supabase stack, per every prior piece.

## Review Focus

- **A crafted checkout request whose `selectedOptionIds` includes an option that belongs to a *different* menu item** (or a different restaurant) than the one it's attached to in the request — the server must reject this (400), not silently accept and mis-price the order. This is the option-level equivalent of the project's existing "never trust client-supplied ids" rule.
- **Deleting a vendor's option group/option after a customer has already placed an order containing it** — the order's `order_item_options` row (and the vendor order queue's display of it) must still show the correct historical name/price via its snapshot columns, not break or show `null`/an FK error, even though the live `menu_item_options` row is gone.
- **A required group (`min_select >= 1`) that currently has zero options defined** (a vendor created the group but hasn't added options yet) — the customer-facing modal's "Add to cart" must stay permanently disabled rather than crash or silently allow an empty selection to satisfy the requirement.
- **Two cart lines for the same menu item with different option selections** must never merge into one line or overwrite each other's quantity — `lineId`, not `menuItemId`, must be the actual key everywhere the cart array is indexed (`updateQuantity`, `removeItem`, `setSpecialInstructions`, and every `.map`/`key=` in `CartPanel`).
- **An old (pre-piece-4) cart already sitting in a customer's `localStorage`** when this ships — must load without wiping the customer's in-progress cart, synthesizing `lineId`/`selectedOptions`/`specialInstructions` for the old shape rather than failing validation and resetting to empty.

---

## File Structure

- Create: `supabase/migrations/00000000000017_item_customization.sql` — schema, RLS, RPC rewrite
- Create: `lib/vendor-option-auth.ts` — shared ownership-check helpers for the new vendor routes
- Create: `app/api/vendor/menu-items/[id]/option-groups/route.ts` — list/create groups for an item
- Create: `app/api/vendor/option-groups/[groupId]/route.ts` — edit/delete a group
- Create: `app/api/vendor/option-groups/[groupId]/options/route.ts` — create an option
- Create: `app/api/vendor/options/[optionId]/route.ts` — edit/delete an option
- Modify: `app/vendor/menu/page.tsx` — "Manage options" panel per item
- Modify: `lib/cart-store.tsx` — `lineId`-keyed cart, `SelectedOption`, special instructions
- Create: `components/ItemCustomizationModal.tsx` — option-selection modal
- Modify: `components/MenuItemRow.tsx` — modal trigger when item has option groups
- Modify: `app/customer/restaurants/[id]/page.tsx` — fetch nested option groups
- Modify: `components/CartPanel.tsx` — `lineId` keys, options summary, note input
- Modify: `app/api/cart/checkout/route.ts` — validate/recompute/persist option selections
- Modify: `app/customer/checkout/page.tsx` — send `selectedOptionIds`/`specialInstructions`
- Modify: `app/api/vendor/orders/route.ts` — nested select for options/instructions
- Modify: `app/vendor/orders/page.tsx` — display options/instructions per line

---

### Task 1: Schema migration — option groups, options, order snapshots, RPC rewrite

**Files:**
- Create: `supabase/migrations/00000000000017_item_customization.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `menu_item_option_groups(id, menu_item_id, name, min_select, max_select, sort_order, created_at)`, `menu_item_options(id, option_group_id, name, price_delta_paise, sort_order, created_at)`, `order_items.special_instructions`, `order_item_options(id, order_item_id, menu_item_option_id, group_name, option_name, price_delta_paise)`, and an updated `checkout_place_order(p_customer_id, p_address_label, p_address_line1, p_address_lat, p_address_lng, p_restaurant_id, p_subtotal, p_delivery_fee, p_total, p_items, p_payment_method, p_payment_status, p_payment_amount, p_payment_paid_at)` whose `p_items` jsonb entries now carry `special_instructions` and a nested `options: [{option_id, group_name, option_name, price_delta_paise}]` array — consumed by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- Piece 4 (item customization): option groups/options schema, order_items
-- special_instructions, order_item_options snapshot table, and an updated
-- checkout_place_order RPC that also writes the new option selections.

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

create index idx_menu_item_option_groups_menu_item_id on public.menu_item_option_groups (menu_item_id);
create index idx_menu_item_options_option_group_id on public.menu_item_options (option_group_id);

alter table public.order_items add column special_instructions text;

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

create index idx_order_item_options_order_item_id on public.order_item_options (order_item_id);

alter table public.menu_item_option_groups enable row level security;
alter table public.menu_item_options enable row level security;
alter table public.order_item_options enable row level security;

-- Public read, same shape as menu_items' existing public-read policy —
-- customers must be able to browse option groups/options unauthenticated.
create policy "public_can_read_option_groups" on public.menu_item_option_groups
  for select using (true);
create policy "public_can_read_options" on public.menu_item_options
  for select using (true);

-- Mirror order_items' existing owner/vendor-scoped read policies exactly.
create policy "owner_can_read_own_order_item_options" on public.order_item_options
  for select using (
    exists (
      select 1 from public.order_items
      join public.orders on orders.id = order_items.order_id
      where order_items.id = order_item_options.order_item_id
        and orders.customer_id = auth.uid()
    )
  );
create policy "vendor_can_read_own_restaurant_order_item_options" on public.order_item_options
  for select using (
    exists (
      select 1 from public.order_items
      join public.orders on orders.id = order_items.order_id
      join public.restaurants on restaurants.id = orders.restaurant_id
      where order_items.id = order_item_options.order_item_id
        and restaurants.owner_id = auth.uid()
    )
  );

-- No RLS write policy on any of the three new tables — every write goes
-- through service-role vendor API routes (option groups/options) or the
-- service-role checkout route (order_item_options), per this project's
-- standing rule against RLS write policies on service-role-only tables.

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
  p_payment_paid_at timestamptz
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

  insert into public.orders (customer_id, restaurant_id, delivery_address_id, status, subtotal, delivery_fee, total)
    values (p_customer_id, p_restaurant_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total)
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

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres < supabase/migrations/00000000000017_item_customization.sql`
Expected: a sequence of `CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE`/`CREATE POLICY`/`CREATE FUNCTION`/`REVOKE`/`GRANT` lines, no errors.

- [ ] **Step 3: Record the migration as applied**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('00000000000017', 'item_customization');"`
Expected: `INSERT 0 1`.

- [ ] **Step 4: Verify the RPC still places a plain order with no options**

Run:
```bash
docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select proname from pg_proc where proname = 'checkout_place_order';"
```
Expected: one row, `checkout_place_order` — confirms the replace succeeded and didn't leave a duplicate/broken signature.

- [ ] **Step 5: Verify a full `supabase db reset` replay also succeeds**

Run: `npx supabase db reset` (requires Docker Desktop running; replays every migration file in order, including `00000000000017`, from scratch)
Expected: completes with no SQL errors, ending in the usual "Finished supabase db reset" success output. Confirm before running if the local stack is mid-use for other work (it resets all local data).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00000000000017_item_customization.sql
git commit -m "feat: add item-customization schema and update checkout RPC"
```

---

### Task 2: Vendor option-group/option CRUD API routes

**Files:**
- Create: `lib/vendor-option-auth.ts`
- Create: `app/api/vendor/menu-items/[id]/option-groups/route.ts`
- Create: `app/api/vendor/option-groups/[groupId]/route.ts`
- Create: `app/api/vendor/option-groups/[groupId]/options/route.ts`
- Create: `app/api/vendor/options/[optionId]/route.ts`

**Interfaces:**
- Consumes: Task 1's tables; `resolveVendorRestaurant`/`tokenFromRequest` from `lib/vendor-auth.ts` (unchanged, existing).
- Produces: `assertOwnsGroup(restaurantId, groupId): Promise<boolean>` and `assertOwnsOption(restaurantId, optionId): Promise<string | null>` (returns the option's `option_group_id` on success, `null` on failure) from `lib/vendor-option-auth.ts` — consumed by every route in this task and reusable by Task 3's UI-facing fetch calls (via the routes, not the functions directly). Five endpoints: `GET/POST /api/vendor/menu-items/[id]/option-groups`, `PATCH/DELETE /api/vendor/option-groups/[groupId]`, `POST /api/vendor/option-groups/[groupId]/options`, `PATCH/DELETE /api/vendor/options/[optionId]` — consumed by Task 3.

- [ ] **Step 1: Write the shared ownership helpers**

```typescript
// lib/vendor-option-auth.ts
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export async function assertOwnsGroup(restaurantId: string, groupId: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("menu_item_option_groups")
    .select("id, menu_items!inner(restaurant_id)")
    .eq("id", groupId)
    .eq("menu_items.restaurant_id", restaurantId)
    .single();
  return !error && !!data;
}

export async function assertOwnsOption(
  restaurantId: string,
  optionId: string
): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("menu_item_options")
    .select("id, option_group_id")
    .eq("id", optionId)
    .single();
  if (error || !data) return null;
  const owns = await assertOwnsGroup(restaurantId, data.option_group_id);
  return owns ? data.option_group_id : null;
}
```

- [ ] **Step 2: Write the group list/create route**

```typescript
// app/api/vendor/menu-items/[id]/option-groups/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";

async function assertOwnsItem(restaurantId: string, itemId: string) {
  const { data, error } = await supabaseServer
    .from("menu_items")
    .select("id")
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId)
    .single();
  return !error && !!data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsItem(resolved.restaurantId, id))) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  const { data, error } = await supabaseServer
    .from("menu_item_option_groups")
    .select(
      "id, name, min_select, max_select, sort_order, menu_item_options(id, name, price_delta_paise, sort_order)"
    )
    .eq("menu_item_id", id)
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Failed to load option groups" }, { status: 500 });
  }
  return NextResponse.json({ groups: data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsItem(resolved.restaurantId, id))) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  const { name, minSelect, maxSelect } = await request.json();
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!Number.isInteger(minSelect) || minSelect < 0) {
    return NextResponse.json(
      { error: "minSelect must be a non-negative integer" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(maxSelect) || maxSelect < 1 || maxSelect < minSelect) {
    return NextResponse.json(
      { error: "maxSelect must be a positive integer >= minSelect" },
      { status: 400 }
    );
  }
  const { count } = await supabaseServer
    .from("menu_item_option_groups")
    .select("id", { count: "exact", head: true })
    .eq("menu_item_id", id);
  const { data, error } = await supabaseServer
    .from("menu_item_option_groups")
    .insert({
      menu_item_id: id,
      name: name.trim(),
      min_select: minSelect,
      max_select: maxSelect,
      sort_order: count ?? 0,
    })
    .select("id, name, min_select, max_select, sort_order")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to create option group" }, { status: 500 });
  }
  return NextResponse.json({ group: { ...data, menu_item_options: [] } });
}
```

- [ ] **Step 3: Write the group edit/delete route**

```typescript
// app/api/vendor/option-groups/[groupId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";
import { assertOwnsGroup } from "@/lib/vendor-option-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsGroup(resolved.restaurantId, groupId))) {
    return NextResponse.json({ error: "Option group not found" }, { status: 404 });
  }
  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    update.name = body.name.trim();
  }
  if (body.minSelect !== undefined) {
    if (!Number.isInteger(body.minSelect) || body.minSelect < 0) {
      return NextResponse.json(
        { error: "minSelect must be a non-negative integer" },
        { status: 400 }
      );
    }
    update.min_select = body.minSelect;
  }
  if (body.maxSelect !== undefined) {
    if (!Number.isInteger(body.maxSelect) || body.maxSelect < 1) {
      return NextResponse.json(
        { error: "maxSelect must be a positive integer" },
        { status: 400 }
      );
    }
    update.max_select = body.maxSelect;
  }
  if (
    typeof update.min_select === "number" &&
    typeof update.max_select === "number" &&
    update.max_select < update.min_select
  ) {
    return NextResponse.json({ error: "maxSelect must be >= minSelect" }, { status: 400 });
  }
  const { data, error } = await supabaseServer
    .from("menu_item_option_groups")
    .update(update)
    .eq("id", groupId)
    .select("id, name, min_select, max_select, sort_order")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to update option group" }, { status: 500 });
  }
  return NextResponse.json({ group: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsGroup(resolved.restaurantId, groupId))) {
    return NextResponse.json({ error: "Option group not found" }, { status: 404 });
  }
  const { error } = await supabaseServer
    .from("menu_item_option_groups")
    .delete()
    .eq("id", groupId);
  if (error) {
    return NextResponse.json({ error: "Failed to delete option group" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write the option create route**

```typescript
// app/api/vendor/option-groups/[groupId]/options/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";
import { assertOwnsGroup } from "@/lib/vendor-option-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsGroup(resolved.restaurantId, groupId))) {
    return NextResponse.json({ error: "Option group not found" }, { status: 404 });
  }
  const { name, priceDeltaRupees } = await request.json();
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const delta = priceDeltaRupees === undefined ? 0 : Number(priceDeltaRupees);
  if (!Number.isFinite(delta) || delta < 0) {
    return NextResponse.json(
      { error: "priceDeltaRupees must be a non-negative number" },
      { status: 400 }
    );
  }
  const { count } = await supabaseServer
    .from("menu_item_options")
    .select("id", { count: "exact", head: true })
    .eq("option_group_id", groupId);
  const { data, error } = await supabaseServer
    .from("menu_item_options")
    .insert({
      option_group_id: groupId,
      name: name.trim(),
      price_delta_paise: Math.round(delta * 100),
      sort_order: count ?? 0,
    })
    .select("id, name, price_delta_paise, sort_order")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to create option" }, { status: 500 });
  }
  return NextResponse.json({ option: data });
}
```

- [ ] **Step 5: Write the option edit/delete route**

```typescript
// app/api/vendor/options/[optionId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";
import { assertOwnsOption } from "@/lib/vendor-option-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ optionId: string }> }
) {
  const { optionId } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsOption(resolved.restaurantId, optionId))) {
    return NextResponse.json({ error: "Option not found" }, { status: 404 });
  }
  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    update.name = body.name.trim();
  }
  if (body.priceDeltaRupees !== undefined) {
    const delta = Number(body.priceDeltaRupees);
    if (!Number.isFinite(delta) || delta < 0) {
      return NextResponse.json(
        { error: "priceDeltaRupees must be a non-negative number" },
        { status: 400 }
      );
    }
    update.price_delta_paise = Math.round(delta * 100);
  }
  const { data, error } = await supabaseServer
    .from("menu_item_options")
    .update(update)
    .eq("id", optionId)
    .select("id, name, price_delta_paise, sort_order")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to update option" }, { status: 500 });
  }
  return NextResponse.json({ option: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ optionId: string }> }
) {
  const { optionId } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsOption(resolved.restaurantId, optionId))) {
    return NextResponse.json({ error: "Option not found" }, { status: 404 });
  }
  const { error } = await supabaseServer.from("menu_item_options").delete().eq("id", optionId);
  if (error) {
    return NextResponse.json({ error: "Failed to delete option" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: Turbopack "Compiled successfully", then "Running TypeScript ..." succeeds, no errors, the 4 new route files listed in the route table (`/api/vendor/menu-items/[id]/option-groups`, `/api/vendor/option-groups/[groupId]`, `/api/vendor/option-groups/[groupId]/options`, `/api/vendor/options/[optionId]`).

- [ ] **Step 7: Commit**

```bash
git add lib/vendor-option-auth.ts "app/api/vendor/menu-items/[id]/option-groups/route.ts" "app/api/vendor/option-groups/[groupId]/route.ts" "app/api/vendor/option-groups/[groupId]/options/route.ts" "app/api/vendor/options/[optionId]/route.ts"
git commit -m "feat: add vendor option-group and option CRUD API routes"
```

---

### Task 3: Vendor "Manage options" UI

**Files:**
- Modify: `app/vendor/menu/page.tsx`

**Interfaces:**
- Consumes: Task 2's 5 API routes.
- Produces: nothing new for later tasks (leaf UI).

- [ ] **Step 1: Add option-group state, types, and handlers**

In `app/vendor/menu/page.tsx`, add these types near the top (after the existing `MenuItem` type) and these state variables/functions inside `VendorMenuPage` (after the existing edit-related state):

```typescript
type OptionValue = { id: string; name: string; price_delta_paise: number; sort_order: number };
type OptionGroupValue = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  menu_item_options: OptionValue[];
};
```

```typescript
const [optionsOpenId, setOptionsOpenId] = useState<string | null>(null);
const [groupsByItem, setGroupsByItem] = useState<Record<string, OptionGroupValue[]>>({});
const [groupName, setGroupName] = useState("");
const [groupMin, setGroupMin] = useState("0");
const [groupMax, setGroupMax] = useState("1");
const [optionForms, setOptionForms] = useState<Record<string, { name: string; price: string }>>({});
const [optionsError, setOptionsError] = useState<string | null>(null);

async function loadGroups(itemId: string) {
  const res = await fetch(`/api/vendor/menu-items/${itemId}/option-groups`, {
    headers: await authHeader(),
  });
  const body = await res.json();
  if (res.ok) setGroupsByItem((prev) => ({ ...prev, [itemId]: body.groups }));
}

function toggleOptions(itemId: string) {
  if (optionsOpenId === itemId) {
    setOptionsOpenId(null);
    return;
  }
  setOptionsOpenId(itemId);
  setOptionsError(null);
  if (!groupsByItem[itemId]) loadGroups(itemId);
}

async function addGroup(itemId: string) {
  setOptionsError(null);
  const min = Number(groupMin);
  const max = Number(groupMax);
  if (
    !groupName.trim() ||
    !Number.isInteger(min) ||
    min < 0 ||
    !Number.isInteger(max) ||
    max < 1 ||
    max < min
  ) {
    setOptionsError("Group needs a name and valid min/max select counts");
    return;
  }
  const res = await fetch(`/api/vendor/menu-items/${itemId}/option-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ name: groupName, minSelect: min, maxSelect: max }),
  });
  const body = await res.json();
  if (!res.ok) {
    setOptionsError(body.error ?? "Failed to add option group");
    return;
  }
  setGroupName("");
  setGroupMin("0");
  setGroupMax("1");
  await loadGroups(itemId);
}

async function deleteGroup(itemId: string, groupId: string) {
  setOptionsError(null);
  const res = await fetch(`/api/vendor/option-groups/${groupId}`, {
    method: "DELETE",
    headers: await authHeader(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    setOptionsError(body.error ?? "Failed to delete option group");
    return;
  }
  await loadGroups(itemId);
}

async function addOption(itemId: string, groupId: string) {
  setOptionsError(null);
  const form = optionForms[groupId] ?? { name: "", price: "0" };
  const price = Number(form.price || "0");
  if (!form.name.trim() || !Number.isFinite(price) || price < 0) {
    setOptionsError("Option needs a name and a non-negative price");
    return;
  }
  const res = await fetch(`/api/vendor/option-groups/${groupId}/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ name: form.name, priceDeltaRupees: price }),
  });
  const body = await res.json();
  if (!res.ok) {
    setOptionsError(body.error ?? "Failed to add option");
    return;
  }
  setOptionForms((prev) => ({ ...prev, [groupId]: { name: "", price: "0" } }));
  await loadGroups(itemId);
}

async function deleteOption(itemId: string, optionId: string) {
  setOptionsError(null);
  const res = await fetch(`/api/vendor/options/${optionId}`, {
    method: "DELETE",
    headers: await authHeader(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    setOptionsError(body.error ?? "Failed to delete option");
    return;
  }
  await loadGroups(itemId);
}
```

- [ ] **Step 2: Add the "Manage options" toggle button and panel to the item list**

In the same file, inside the `<li key={item.id} ...>` block, add an "Options" button next to the existing "Edit"/"Mark unavailable"/"Delete" buttons (inside the `<div className="flex gap-2">` that holds them):

```tsx
<button
  onClick={() => toggleOptions(item.id)}
  className="rounded-lg bg-brand-accent/10 px-2 py-1 text-xs text-brand-ink"
>
  {optionsOpenId === item.id ? "Hide options" : "Options"}
</button>
```

Then, as a sibling of the existing `{editingId === item.id && (...)}` block (after it, still inside the `<li>`), add:

```tsx
{optionsOpenId === item.id && (
  <div className="flex flex-col gap-3 rounded border bg-brand-accent/5 p-2">
    {optionsError && <p className="text-sm text-red-600">{optionsError}</p>}
    <div className="flex flex-col gap-1 rounded border border-brand-ink-muted/15 p-2">
      <p className="text-xs font-semibold text-brand-ink">Add option group</p>
      <input
        className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
        placeholder="Group name (e.g. Size)"
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className="w-1/2 rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
          placeholder="Min select"
          type="number"
          value={groupMin}
          onChange={(e) => setGroupMin(e.target.value)}
        />
        <input
          className="w-1/2 rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
          placeholder="Max select"
          type="number"
          value={groupMax}
          onChange={(e) => setGroupMax(e.target.value)}
        />
      </div>
      <button
        onClick={() => addGroup(item.id)}
        className="mt-1 self-start rounded-full bg-brand-primary px-3 py-1 text-xs text-white"
      >
        Add group
      </button>
    </div>
    {(groupsByItem[item.id] ?? []).map((group) => (
      <div key={group.id} className="rounded border border-brand-ink-muted/15 p-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-brand-ink">
            {group.name}{" "}
            <span className="text-xs font-normal text-brand-ink-muted">
              (min {group.min_select}, max {group.max_select})
            </span>
          </p>
          <button
            onClick={() => deleteGroup(item.id, group.id)}
            className="rounded bg-red-100 px-2 py-1 text-xs text-red-700"
          >
            Delete group
          </button>
        </div>
        <ul className="mt-1 flex flex-col gap-1">
          {group.menu_item_options.map((option) => (
            <li key={option.id} className="flex items-center justify-between text-sm">
              <span>
                {option.name} · +₹{(option.price_delta_paise / 100).toFixed(2)}
              </span>
              <button
                onClick={() => deleteOption(item.id, option.id)}
                className="text-xs text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
            placeholder="Option name"
            value={optionForms[group.id]?.name ?? ""}
            onChange={(e) =>
              setOptionForms((prev) => ({
                ...prev,
                [group.id]: { name: e.target.value, price: prev[group.id]?.price ?? "0" },
              }))
            }
          />
          <input
            className="w-24 rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
            placeholder="+₹"
            type="number"
            value={optionForms[group.id]?.price ?? "0"}
            onChange={(e) =>
              setOptionForms((prev) => ({
                ...prev,
                [group.id]: { name: prev[group.id]?.name ?? "", price: e.target.value },
              }))
            }
          />
          <button
            onClick={() => addOption(item.id, group.id)}
            className="rounded-full bg-brand-primary px-3 py-1 text-xs text-white"
          >
            Add
          </button>
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: full success including the TypeScript phase.

- [ ] **Step 4: Commit**

```bash
git add app/vendor/menu/page.tsx
git commit -m "feat: add vendor option-group management UI to menu page"
```

---

### Task 4: Cart-store rewrite — `lineId`, `SelectedOption`, special instructions

**Files:**
- Modify: `lib/cart-store.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure frontend rewrite).
- Produces: `SelectedOption`, `CartItem` (now includes `lineId`, `selectedOptions`, `specialInstructions`), `buildLineId(menuItemId, selectedOptions): string`, `addItem(restaurantId, restaurantName, item: Omit<CartItem, "lineId">)`, `updateQuantity(lineId, quantity)`, `removeItem(lineId)`, `setSpecialInstructions(lineId, text)` — consumed by Tasks 5, 6, 7, 8.

- [ ] **Step 1: Replace the full contents of `lib/cart-store.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type SelectedOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDeltaPaise: number;
};

export type CartItem = {
  lineId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions: SelectedOption[];
  specialInstructions: string | null;
};

type NewCartItem = Omit<CartItem, "lineId">;

type PendingConflict = {
  restaurantId: string;
  restaurantName: string;
  item: NewCartItem;
} | null;

type CartContextValue = {
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
  subtotal: number;
  pendingConflict: PendingConflict;
  addItem: (restaurantId: string, restaurantName: string, item: NewCartItem) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  setSpecialInstructions: (lineId: string, text: string) => void;
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

export function buildLineId(menuItemId: string, selectedOptions: SelectedOption[]): string {
  const optionIds = selectedOptions.map((o) => o.optionId).sort();
  return `${menuItemId}::${optionIds.join(",")}`;
}

// Accepts both the current shape and the pre-piece-4 shape (menuItemId/
// name/price/quantity only) so an in-progress customer cart already in
// localStorage survives this deploy instead of being wiped.
function normalizeStoredItem(raw: Record<string, unknown>): CartItem | null {
  if (
    typeof raw.menuItemId !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.price !== "number" ||
    typeof raw.quantity !== "number" ||
    raw.quantity <= 0
  ) {
    return null;
  }
  const selectedOptions: SelectedOption[] = Array.isArray(raw.selectedOptions)
    ? (raw.selectedOptions as unknown[]).filter(
        (o): o is SelectedOption =>
          o !== null &&
          typeof o === "object" &&
          typeof (o as Record<string, unknown>).groupId === "string" &&
          typeof (o as Record<string, unknown>).groupName === "string" &&
          typeof (o as Record<string, unknown>).optionId === "string" &&
          typeof (o as Record<string, unknown>).optionName === "string" &&
          typeof (o as Record<string, unknown>).priceDeltaPaise === "number"
      )
    : [];
  const specialInstructions =
    typeof raw.specialInstructions === "string" ? raw.specialInstructions : null;
  const lineId =
    typeof raw.lineId === "string" ? raw.lineId : buildLineId(raw.menuItemId, selectedOptions);
  return {
    lineId,
    menuItemId: raw.menuItemId,
    name: raw.name,
    price: raw.price,
    quantity: raw.quantity,
    selectedOptions,
    specialInstructions,
  };
}

function loadStoredCart(): StoredCart {
  if (typeof window === "undefined") {
    return { restaurantId: null, restaurantName: null, items: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { restaurantId: null, restaurantName: null, items: [] };
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !(parsed.restaurantId === null || typeof parsed.restaurantId === "string") ||
      !(parsed.restaurantName === null || typeof parsed.restaurantName === "string") ||
      !Array.isArray(parsed.items)
    ) {
      return { restaurantId: null, restaurantName: null, items: [] };
    }
    const items = (parsed.items as unknown[])
      .map((i) =>
        i !== null && typeof i === "object"
          ? normalizeStoredItem(i as Record<string, unknown>)
          : null
      )
      .filter((i): i is CartItem => i !== null);
    return { restaurantId: parsed.restaurantId, restaurantName: parsed.restaurantName, items };
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

  function addItemDirect(rId: string, rName: string, item: NewCartItem) {
    const lineId = buildLineId(item.menuItemId, item.selectedOptions);
    setRestaurantId(rId);
    setRestaurantName(rName);
    setItems((prev) => {
      const existing = prev.find((i) => i.lineId === lineId);
      if (existing) {
        return prev.map((i) =>
          i.lineId === lineId ? { ...i, quantity: i.quantity + item.quantity } : i
        );
      }
      return [...prev, { ...item, lineId }];
    });
  }

  function addItem(rId: string, rName: string, item: NewCartItem) {
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

  function updateQuantity(lineId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(lineId);
      return;
    }
    setItems((prev) => prev.map((i) => (i.lineId === lineId ? { ...i, quantity } : i)));
  }

  function removeItem(lineId: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.lineId !== lineId);
      if (next.length === 0) {
        setRestaurantId(null);
        setRestaurantName(null);
      }
      return next;
    });
  }

  function setSpecialInstructions(lineId: string, text: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.lineId === lineId
          ? { ...i, specialInstructions: text.trim() === "" ? null : text }
          : i
      )
    );
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
        setSpecialInstructions,
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

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: this will show type errors in every file that still calls `addItem`/`updateQuantity`/`removeItem` with the old shapes (`MenuItemRow.tsx`, `CartPanel.tsx`) — confirm the errors are confined to those two files (fixed in Tasks 6 and 7) and not `lib/cart-store.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add lib/cart-store.tsx
git commit -m "feat: rewrite cart store around lineId, selected options, special instructions"
```

---

### Task 5: `ItemCustomizationModal` component

**Files:**
- Create: `components/ItemCustomizationModal.tsx`

**Interfaces:**
- Consumes: `useCart().addItem` (Task 4), the nested option-group shape Task 6 will fetch (`{ id, name, min_select, max_select, menu_item_options: { id, name, price_delta_paise }[] }[]`).
- Produces: `ItemCustomizationModal({ item, optionGroups, restaurantId, restaurantName, onClose })` — consumed by Task 6.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useCart, SelectedOption } from "@/lib/cart-store";

type Option = { id: string; name: string; price_delta_paise: number };
type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  menu_item_options: Option[];
};

type Item = {
  id: string;
  name: string;
  price: number;
};

export function ItemCustomizationModal({
  item,
  optionGroups,
  restaurantId,
  restaurantName,
  onClose,
}: {
  item: Item;
  optionGroups: OptionGroup[];
  restaurantId: string;
  restaurantName: string;
  onClose: () => void;
}) {
  const { addItem } = useCart();
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [quantity, setQuantity] = useState(1);

  function isSelected(groupId: string, optionId: string) {
    return selected[groupId]?.has(optionId) ?? false;
  }

  function toggleOption(group: OptionGroup, optionId: string) {
    setSelected((prev) => {
      const current = new Set(prev[group.id] ?? []);
      if (group.max_select === 1) {
        return { ...prev, [group.id]: current.has(optionId) ? new Set() : new Set([optionId]) };
      }
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        if (current.size >= group.max_select) return prev;
        current.add(optionId);
      }
      return { ...prev, [group.id]: current };
    });
  }

  const allGroupsValid = optionGroups.every((group) => {
    const count = selected[group.id]?.size ?? 0;
    return count >= group.min_select && count <= group.max_select;
  });

  const selectedOptions: SelectedOption[] = optionGroups.flatMap((group) =>
    Array.from(selected[group.id] ?? []).map((optionId) => {
      const option = group.menu_item_options.find((o) => o.id === optionId)!;
      return {
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDeltaPaise: option.price_delta_paise,
      };
    })
  );

  const unitPricePaise =
    Math.round(item.price * 100) + selectedOptions.reduce((sum, o) => sum + o.priceDeltaPaise, 0);
  const totalPaise = unitPricePaise * quantity;

  function handleAdd() {
    if (!allGroupsValid) return;
    addItem(restaurantId, restaurantName, {
      menuItemId: item.id,
      name: item.name,
      price: unitPricePaise / 100,
      quantity,
      selectedOptions,
      specialInstructions: null,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-lg bg-brand-surface p-4 sm:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-ink">{item.name}</h2>
          <button onClick={onClose} className="text-brand-ink-muted" aria-label="Close">
            ✕
          </button>
        </div>
        {optionGroups.map((group) => (
          <div key={group.id} className="mb-4">
            <p className="mb-1 text-sm font-semibold text-brand-ink">
              {group.name}
              <span className="ml-2 text-xs font-normal text-brand-ink-muted">
                {group.min_select > 0
                  ? `Required · choose ${
                      group.min_select === group.max_select
                        ? group.min_select
                        : `${group.min_select}-${group.max_select}`
                    }`
                  : `Optional · up to ${group.max_select}`}
              </span>
            </p>
            <div className="flex flex-col gap-1">
              {group.menu_item_options.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-brand-ink-muted/15 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type={group.max_select === 1 ? "radio" : "checkbox"}
                      name={group.id}
                      checked={isSelected(group.id, option.id)}
                      onChange={() => toggleOption(group, option.id)}
                      className="accent-brand-primary"
                    />
                    {option.name}
                  </span>
                  {option.price_delta_paise > 0 && (
                    <span className="text-brand-ink-muted">
                      +₹{(option.price_delta_paise / 100).toFixed(2)}
                    </span>
                  )}
                </label>
              ))}
              {group.menu_item_options.length === 0 && (
                <p className="text-xs text-brand-ink-muted">No options available yet.</p>
              )}
            </div>
          </div>
        ))}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-brand-ink">Quantity</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="rounded-full border border-brand-ink-muted/20 px-2"
            >
              −
            </button>
            <span>{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="rounded-full border border-brand-ink-muted/20 px-2"
            >
              +
            </button>
          </div>
        </div>
        <button
          disabled={!allGroupsValid}
          onClick={handleAdd}
          className="w-full rounded-full bg-brand-primary px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add {quantity} to cart · ₹{(totalPaise / 100).toFixed(2)}
        </button>
      </div>
    </div>
  );
}
```

Note the explicit "No options available yet." fallback inside an empty group — this is what keeps the modal from rendering a silently-empty required group; combined with `allGroupsValid`'s count check, "Add to cart" stays disabled forever for such a group rather than crashing or allowing a false-valid empty selection (Review Focus item 3).

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: succeeds (not imported anywhere yet, so it only needs to type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add components/ItemCustomizationModal.tsx
git commit -m "feat: add ItemCustomizationModal component"
```

---

### Task 6: Wire option groups into `MenuItemRow` and the restaurant page

**Files:**
- Modify: `components/MenuItemRow.tsx`
- Modify: `app/customer/restaurants/[id]/page.tsx`

**Interfaces:**
- Consumes: `ItemCustomizationModal` (Task 5), `useCart` (Task 4).
- Produces: `MenuItemRow` gains an optional `optionGroups` prop; no other task depends on this file further.

- [ ] **Step 1: Replace the full contents of `components/MenuItemRow.tsx`**

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useCart } from "@/lib/cart-store";
import { ItemCustomizationModal } from "@/components/ItemCustomizationModal";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
};

type Option = { id: string; name: string; price_delta_paise: number };
type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  menu_item_options: Option[];
};

export function MenuItemRow({
  item,
  restaurantId,
  restaurantName,
  disabled = false,
  optionGroups = [],
}: {
  item: MenuItem;
  restaurantId: string;
  restaurantName: string;
  disabled?: boolean;
  optionGroups?: OptionGroup[];
}) {
  const { addItem } = useCart();
  const [modalOpen, setModalOpen] = useState(false);
  const canAdd = !disabled && item.is_available;
  const hasOptions = optionGroups.length > 0;

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
      selectedOptions: [],
      specialInstructions: null,
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-brand-ink">
          {item.is_veg ? "🟢" : "🔴"} {item.name}
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-brand-ink-muted">{item.description}</p>
        )}
        <p className="mt-1 text-sm font-semibold text-brand-ink">₹{item.price.toFixed(2)}</p>
        {!canAdd && (
          <p className="mt-1 text-xs text-brand-ink-muted">
            {disabled ? "Restaurant unavailable" : "Currently unavailable"}
          </p>
        )}
      </div>
      <div className="relative h-[72px] w-[72px] shrink-0">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-lg object-cover"
          />
        ) : (
          <div className="h-[72px] w-[72px] rounded-lg bg-brand-accent/10" />
        )}
        <button
          disabled={!canAdd}
          onClick={handleAddClick}
          aria-label={`Add ${item.name}`}
          className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-accent text-base font-bold leading-none text-brand-ink shadow-md disabled:cursor-not-allowed disabled:bg-brand-ink-muted/30 disabled:text-brand-ink-muted disabled:opacity-60"
        >
          +
        </button>
      </div>
      {modalOpen && (
        <ItemCustomizationModal
          item={item}
          optionGroups={optionGroups}
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Extend the restaurant page's `MenuItem` type and Supabase select**

In `app/customer/restaurants/[id]/page.tsx`, replace the `MenuItem` type and add two new types above it:

```typescript
type Option = { id: string; name: string; price_delta_paise: number; sort_order: number };
type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  menu_item_options: Option[];
};

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
  category: string | null;
  menu_item_option_groups: OptionGroup[];
};
```

Replace the `menu_items` select string inside the `useEffect`'s `load` function:

```typescript
supabase
  .from("menu_items")
  .select(
    "id, name, description, price, is_veg, is_available, image_url, category, menu_item_option_groups(id, name, min_select, max_select, sort_order, menu_item_options(id, name, price_delta_paise, sort_order))"
  )
  .eq("restaurant_id", params.id),
```

- [ ] **Step 3: Add a sort helper and pass `optionGroups` to both `MenuItemRow` render sites**

Add this function above `export default function RestaurantMenuPage()`:

```typescript
function sortedGroups(item: MenuItem): OptionGroup[] {
  return [...item.menu_item_option_groups]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((g) => ({
      ...g,
      menu_item_options: [...g.menu_item_options].sort((a, b) => a.sort_order - b.sort_order),
    }));
}
```

In both places `<MenuItemRow ... />` is rendered (the grouped-view branch and the flat-list branch), add the `optionGroups` prop:

```tsx
<MenuItemRow
  key={item.id}
  item={item}
  restaurantId={restaurant.id}
  restaurantName={restaurant.name}
  disabled={isUnavailable}
  optionGroups={sortedGroups(item)}
/>
```

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: full success including the TypeScript phase.

- [ ] **Step 5: Commit**

```bash
git add components/MenuItemRow.tsx "app/customer/restaurants/[id]/page.tsx"
git commit -m "feat: wire option-group customization modal into the restaurant page"
```

---

### Task 7: `CartPanel` — `lineId` keys, options summary, note input

**Files:**
- Modify: `components/CartPanel.tsx`

**Interfaces:**
- Consumes: `useCart` (Task 4, now `lineId`/`selectedOptions`/`specialInstructions`/`setSpecialInstructions`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Replace the full contents of `components/CartPanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart-store";

export function CartPanel() {
  const {
    restaurantName,
    items,
    subtotal,
    updateQuantity,
    removeItem,
    setSpecialInstructions,
    clearCart,
  } = useCart();
  const [open, setOpen] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  if (items.length === 0) return null;

  function noteValue(lineId: string, current: string | null) {
    return noteDrafts[lineId] ?? current ?? "";
  }

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
        <div className="max-h-80 overflow-y-auto border-t border-gray-100 px-4 py-2">
          {items.map((item) => (
            <div key={item.lineId} className="border-b border-gray-100 py-2 last:border-b-0">
              <div className="flex items-center justify-between">
                <span className="text-sm">{item.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                    className="rounded border px-2"
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                    className="rounded border px-2"
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
                <p className="mt-0.5 text-xs text-gray-500">
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
                placeholder="Add a note (optional)"
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-xs"
              />
            </div>
          ))}
          <button onClick={clearCart} className="mt-2 text-xs text-gray-500 underline">
            Clear cart
          </button>
          <Link
            href="/customer/checkout"
            className="mt-2 block rounded bg-brand-primary px-3 py-2 text-center text-sm text-white"
          >
            Checkout
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: full success including the TypeScript phase.

- [ ] **Step 3: Commit**

```bash
git add components/CartPanel.tsx
git commit -m "feat: add lineId keys, options summary, and note input to CartPanel"
```

---

### Task 8: Checkout route + page — validate, recompute, persist options

**Files:**
- Modify: `app/api/cart/checkout/route.ts`
- Modify: `app/customer/checkout/page.tsx`

**Interfaces:**
- Consumes: Task 1's RPC shape, Task 4's `CartItem` shape (`selectedOptions`, `specialInstructions`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Replace the full contents of `app/api/cart/checkout/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { PAYMENT_SUCCESS_RATE } from "@/lib/order-constants";

type CheckoutRequestItem = {
  menuItemId: string;
  quantity: number;
  selectedOptionIds: string[];
  specialInstructions: string | null;
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const customerId = userData.user.id;

  const body = await request.json();
  const {
    restaurantId,
    items,
    deliveryAddress,
    paymentMethod,
    expectedTotal,
  }: {
    restaurantId: string;
    items: CheckoutRequestItem[];
    deliveryAddress: { label: string; lat: number; lng: number };
    paymentMethod: "mock_card" | "mock_upi" | "mock_cod";
    expectedTotal?: number;
  } = body;

  if (!restaurantId || !items?.length || !deliveryAddress) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 50) {
      return NextResponse.json({ error: "Invalid item quantity" }, { status: 400 });
    }
    if (item.selectedOptionIds !== undefined && !Array.isArray(item.selectedOptionIds)) {
      return NextResponse.json({ error: "Invalid selected options" }, { status: 400 });
    }
    if (
      item.specialInstructions !== undefined &&
      item.specialInstructions !== null &&
      typeof item.specialInstructions !== "string"
    ) {
      return NextResponse.json({ error: "Invalid special instructions" }, { status: 400 });
    }
  }

  const VALID_PAYMENT_METHODS = ["mock_card", "mock_upi", "mock_cod"];
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }
  if (
    typeof deliveryAddress.lat !== "number" ||
    !Number.isFinite(deliveryAddress.lat) ||
    typeof deliveryAddress.lng !== "number" ||
    !Number.isFinite(deliveryAddress.lng) ||
    typeof deliveryAddress.label !== "string" ||
    deliveryAddress.label.trim().length === 0
  ) {
    return NextResponse.json({ error: "Invalid delivery address" }, { status: 400 });
  }

  const { data: restaurant, error: restaurantError } = await supabaseServer
    .from("restaurants")
    .select("id, is_open, is_suspended, delivery_fee_paise")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  if (!restaurant.is_open || restaurant.is_suspended) {
    return NextResponse.json({ error: "Restaurant is currently closed" }, { status: 409 });
  }

  const menuItemIds = items.map((i) => i.menuItemId);
  const { data: menuItems, error: menuError } = await supabaseServer
    .from("menu_items")
    .select(
      "id, restaurant_id, price, is_available, menu_item_option_groups(id, name, min_select, max_select, menu_item_options(id, name, price_delta_paise))"
    )
    .in("id", menuItemIds);

  if (menuError || !menuItems || menuItems.length !== menuItemIds.length) {
    return NextResponse.json({ error: "One or more menu items not found" }, { status: 404 });
  }

  for (const item of menuItems) {
    if (item.restaurant_id !== restaurantId) {
      return NextResponse.json(
        { error: "Cart contains items from more than one restaurant" },
        { status: 409 }
      );
    }
    if (!item.is_available) {
      return NextResponse.json(
        { error: "One or more items are no longer available" },
        { status: 409 }
      );
    }
  }

  const priceById = new Map(menuItems.map((m) => [m.id, Number(m.price)]));

  type OptionInfo = {
    groupId: string;
    groupName: string;
    optionName: string;
    priceDeltaPaise: number;
  };
  const optionInfoById = new Map<string, OptionInfo>();
  const groupsByMenuItem = new Map<
    string,
    { id: string; min_select: number; max_select: number }[]
  >();
  for (const mi of menuItems) {
    const groups = mi.menu_item_option_groups ?? [];
    groupsByMenuItem.set(
      mi.id,
      groups.map((g) => ({ id: g.id, min_select: g.min_select, max_select: g.max_select }))
    );
    for (const g of groups) {
      for (const o of g.menu_item_options ?? []) {
        optionInfoById.set(o.id, {
          groupId: g.id,
          groupName: g.name,
          optionName: o.name,
          priceDeltaPaise: o.price_delta_paise,
        });
      }
    }
  }

  // Every selected option must belong to a group on THAT SPECIFIC menu
  // item, and every group's own min/max must be satisfied — never trust
  // the client's selections, prices, or which item they claim to attach to.
  for (const item of items) {
    const groups = groupsByMenuItem.get(item.menuItemId) ?? [];
    const groupIds = new Set(groups.map((g) => g.id));
    const countByGroup = new Map<string, number>();
    for (const optionId of item.selectedOptionIds ?? []) {
      const info = optionInfoById.get(optionId);
      if (!info || !groupIds.has(info.groupId)) {
        return NextResponse.json(
          { error: "One or more selected options are invalid for this item" },
          { status: 400 }
        );
      }
      countByGroup.set(info.groupId, (countByGroup.get(info.groupId) ?? 0) + 1);
    }
    for (const group of groups) {
      const count = countByGroup.get(group.id) ?? 0;
      if (count < group.min_select || count > group.max_select) {
        return NextResponse.json(
          { error: "One or more required option selections are missing or invalid" },
          { status: 400 }
        );
      }
    }
  }

  const subtotalPaise = items.reduce((sum, item) => {
    const basePaise = Math.round((priceById.get(item.menuItemId) ?? 0) * 100);
    const deltaPaise = (item.selectedOptionIds ?? []).reduce(
      (s, optionId) => s + (optionInfoById.get(optionId)?.priceDeltaPaise ?? 0),
      0
    );
    return sum + (basePaise + deltaPaise) * item.quantity;
  }, 0);
  const deliveryFeePaise = restaurant.delivery_fee_paise;
  const totalPaise = subtotalPaise + deliveryFeePaise;
  const subtotal = subtotalPaise / 100;
  const total = totalPaise / 100;

  if (typeof expectedTotal === "number" && Math.abs(expectedTotal - total) > 0.01) {
    return NextResponse.json(
      { error: "Prices have changed since you added items to your cart. Please review your order." },
      { status: 409 }
    );
  }

  const orderItemsPayload = items.map((item) => {
    const basePaise = Math.round((priceById.get(item.menuItemId) ?? 0) * 100);
    const options = (item.selectedOptionIds ?? []).map((optionId) => {
      const info = optionInfoById.get(optionId)!;
      return {
        option_id: optionId,
        group_name: info.groupName,
        option_name: info.optionName,
        price_delta_paise: info.priceDeltaPaise,
      };
    });
    const deltaPaise = options.reduce((s, o) => s + o.price_delta_paise, 0);
    return {
      menu_item_id: item.menuItemId,
      quantity: item.quantity,
      unit_price: (basePaise + deltaPaise) / 100,
      special_instructions: item.specialInstructions ?? null,
      options,
    };
  });

  // Mock payment resolution — synchronous, in-process (no n8n yet).
  // mock_cod always succeeds; mock_card/mock_upi resolve randomly.
  // This determination is not itself a write, so it stays here in TS
  // and its result is passed into the RPC to be inserted atomically
  // with the order/address/order_items.
  const paymentSucceeds =
    paymentMethod === "mock_cod" || Math.random() < PAYMENT_SUCCESS_RATE;
  const paymentStatus = paymentSucceeds ? "success" : "failed";

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
  });

  if (rpcError || !rpcRows || !rpcRows[0]) {
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }

  const order = { id: rpcRows[0].order_id as string };

  if (!paymentSucceeds) {
    const { error: cancelError } = await supabaseServer
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
    if (cancelError) {
      console.error("Failed to mark order cancelled after payment failure:", order.id, cancelError);
    }
  }

  return NextResponse.json({ orderId: order.id, paymentStatus });
}
```

- [ ] **Step 2: Update the checkout page's request body**

In `app/customer/checkout/page.tsx`, inside `handleSubmit`, replace the `items:` line in the `fetch("/api/cart/checkout", ...)` body:

```typescript
items: items.map((i) => ({
  menuItemId: i.menuItemId,
  quantity: i.quantity,
  selectedOptionIds: i.selectedOptions.map((o) => o.optionId),
  specialInstructions: i.specialInstructions,
})),
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: full success including the TypeScript phase.

- [ ] **Step 4: Commit**

```bash
git add app/api/cart/checkout/route.ts app/customer/checkout/page.tsx
git commit -m "feat: validate, recompute, and persist option selections at checkout"
```

---

### Task 9: Vendor order queue — display selected options and notes

**Files:**
- Modify: `app/api/vendor/orders/route.ts`
- Modify: `app/vendor/orders/page.tsx`

**Interfaces:**
- Consumes: Task 1's `order_item_options`/`order_items.special_instructions`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Extend the nested select**

In `app/api/vendor/orders/route.ts`, replace the `.select(...)` call's argument:

```typescript
.select(
  "id, status, subtotal, delivery_fee, total, placed_at, order_items(id, quantity, unit_price, special_instructions, menu_items(name), order_item_options(id, group_name, option_name))"
)
```

- [ ] **Step 2: Update the vendor orders page's types and display**

In `app/vendor/orders/page.tsx`, find the `OrderItem` type and replace it:

```typescript
type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  special_instructions: string | null;
  menu_items: { name: string } | null;
  order_item_options: { id: string; group_name: string; option_name: string }[];
};
```

Replace the `order.order_items.map(...)` block:

```tsx
{order.order_items.map((item) => (
  <li key={item.id}>
    {item.quantity}× {item.menu_items?.name ?? "Item"}
    {item.order_item_options.length > 0 && (
      <span className="text-brand-ink-muted">
        {" "}
        — {item.order_item_options.map((o) => o.option_name).join(", ")}
      </span>
    )}
    {item.special_instructions && (
      <span className="text-brand-ink-muted"> — &quot;{item.special_instructions}&quot;</span>
    )}
  </li>
))}
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: full success including the TypeScript phase.

- [ ] **Step 4: Commit**

```bash
git add app/api/vendor/orders/route.ts app/vendor/orders/page.tsx
git commit -m "feat: show selected options and notes on the vendor order queue"
```

---

### Task 10: Live verification across the full flow

**Files:** none (verification only — fix any bug found in the file it belongs to, then re-run this task's steps)

**Interfaces:**
- Consumes: everything from Tasks 1-9.
- Produces: nothing — this is the plan's final gate.

Ensure Docker Desktop is running and the local Supabase stack is up before starting.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or confirm one is already running)

- [ ] **Step 2: Vendor flow — create option groups and options**

Log into an existing vendor account at `/vendor/login`, open `/vendor/menu`, click "Options" on a menu item, add a group named "Size" with min=1/max=1, add options "Small" (+₹0), "Medium" (+₹20), "Large" (+₹40); add a second group "Add-ons" with min=0/max=3, add 2-3 options with positive price deltas.
Expected: both groups and their options appear immediately after each add, with correct min/max and prices shown.

- [ ] **Step 3: Verify vendor ownership scoping**

Using a second vendor account's session token (or `curl` with it), attempt `POST /api/vendor/option-groups/<groupId-from-step-2>/options` for the first vendor's group.
Expected: 404 "Option group not found" — confirms cross-vendor writes are rejected.

- [ ] **Step 4: Customer flow — modal trigger, validation, merge behavior**

Navigate to that restaurant's page as a customer. Confirm the customized item's corner `+` button opens `ItemCustomizationModal`, not an instant add. Confirm "Add to cart" is disabled until the required "Size" group has a selection. Select "Medium" + one add-on, add to cart, then repeat with the exact same selections — confirm the cart panel shows one line at quantity 2 (merge). Then add the same item with "Large" instead — confirm a second, separate cart line appears (Review Focus: lineId keying).

- [ ] **Step 5: Verify a required group with zero options stays permanently disabled**

Create a third option group ("Toppings", min=1/max=1) on a different item but add no options to it yet. Open that item's modal.
Expected: "No options available yet." shown under the group, "Add to cart" stays disabled — cannot be satisfied, does not crash (Review Focus item 3).

- [ ] **Step 6: Verify special instructions on both a customized and a plain item**

Add a plain (no option groups) item via Quick Add and the customized item from Step 4 to the cart. In the cart panel, type a note on each line, confirm both persist independently after a page reload (localStorage).

- [ ] **Step 7: Verify backward-compatible localStorage migration**

With dev tools open, manually set `localStorage.foodhub_cart` to an old-shape value before reloading:

```js
localStorage.setItem(
  "foodhub_cart",
  JSON.stringify({
    restaurantId: "<a-real-restaurant-id>",
    restaurantName: "Test",
    items: [{ menuItemId: "<a-real-plain-menu-item-id>", name: "Test Item", price: 100, quantity: 1 }],
  })
);
```

Reload the customer app.
Expected: the cart panel still shows 1 item (not wiped), and its quantity/remove controls work — confirms `normalizeStoredItem` synthesized `lineId`/`selectedOptions`/`specialInstructions` correctly.

- [ ] **Step 8: Place a real order with a customized item and verify the DB**

Complete checkout with the cart from Step 6 (customized + plain item, both with notes). After the order confirms, run:

```bash
docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select oi.id, oi.quantity, oi.unit_price, oi.special_instructions, ooi.group_name, ooi.option_name, ooi.price_delta_paise from public.order_items oi left join public.order_item_options ooi on ooi.order_item_id = oi.id where oi.order_id = (select id from public.orders order by placed_at desc limit 1);"
```
Expected: one row per selected option matching what was chosen in Step 4, `special_instructions` matching the typed notes, and `unit_price` equal to the base item price plus the selected deltas.

- [ ] **Step 9: Verify checkout rejects a crafted cross-item option id**

Using `curl` with a real customer bearer token, POST to `/api/cart/checkout` with a valid `restaurantId`/`deliveryAddress`/`paymentMethod` but with one item's `selectedOptionIds` containing an option id that belongs to a *different* menu item's option group.
Expected: 400 "One or more selected options are invalid for this item" — the order must not be created (Review Focus item 1).

- [ ] **Step 10: Verify checkout rejects skipping a required group's minimum**

Repeat Step 9's `curl`, this time with the "Size" item's `selectedOptionIds` set to `[]` (skipping the required group entirely).
Expected: 400 "One or more required option selections are missing or invalid".

- [ ] **Step 11: Verify order history survives a deleted option**

Delete one of the options used in Step 8's order via `/vendor/menu`'s "Options" panel. Re-run Step 8's query.
Expected: the `order_item_options` row for that option still shows its original `group_name`/`option_name`/`price_delta_paise` (the snapshot), even though `menu_item_option_id` is now `null` and the live option no longer exists — confirms Review Focus item 2. Also reload `/vendor/orders` and confirm that order's display line still shows the option name correctly.

- [ ] **Step 12: Vendor order queue display**

Reload `/vendor/orders` for the order placed in Step 8 (before Step 11's delete, or re-check after — either way).
Expected: the order's line items show the selected option names and the special-instructions note appended, as designed in Task 9.

- [ ] **Step 13: Screenshot at desktop and mobile width**

Screenshot the `ItemCustomizationModal` (open, mid-selection) and the cart panel (with a customized line + note) at desktop width and at 390px width.
Expected: no layout breakage, modal is usable and scrollable on a short viewport, no console errors.

- [ ] **Step 14: Final build check**

Run: `npm run build`
Expected: full success including the TypeScript phase — this is the plan's final gate before merge.
