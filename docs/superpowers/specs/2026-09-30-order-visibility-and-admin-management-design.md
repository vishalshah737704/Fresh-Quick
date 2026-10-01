# Order Visibility, Admin Management & Delivered Email — Design

Date: 2026-09-30. Status: approved in conversation, pending written-spec review.

## Goal

Give every actor (customer, vendor, delivery partner, admin) a complete, readable view of an order; split the admin dashboard into screens and let admin add vendors and delivery partners; email the customer on delivery. Applies to web and mobile where a mobile portal exists.

## Scope

- Web: Customer, Vendor, Delivery, Admin portals.
- Mobile (Expo): Customer and Delivery portals only. Vendor and Admin have no mobile portal and stay web-only.
- n8n: delivered email.
- Docs: both user manuals (docx + pdf, web and mobile) updated after everything ships.
- Out of scope: Supabase realtime (polling stays), vendor order history, Customers admin screen, new mobile portals for Vendor/Admin.

## Decisions (from brainstorm)

- Customer timeline has 6 steps: Placed, Accepted, Preparing, Ready, On the way, Delivered.
- Admin-created vendors/partners: admin types email + temporary password; account active immediately.
- Delivered email goes to `orders.recipient_email` (checkout email), not the auth email.
- Admin nav: Overview, Orders, Vendors, Delivery Partners.

## Shared foundation

- `lib/order-status.ts`: single `OrderStatus` type, labels, colors. Replaces duplicates in `components/OrderStatusTimeline.tsx`, `app/customer/orders/[id]/page.tsx`, `mobile/lib/order-status.ts` (mobile keeps its own copy, synced to the same values).
- Shared server helper returning the full order: recipient name/email, delivery address (all columns), store name + address, items (qty, unit price, options, notes, `products.image_url`), subtotal, delivery fee, total, payment, timestamps. Each role's route wraps it with its own auth (`resolveVendor`, `resolveDelivery`, `resolveAdmin`, customer session token). Money stays integer paise.
- `OrderDetailView` component (web) rendering the full order with item thumbnails; role-specific action slots.
- Verify RLS: customer can read own `order_items` / related `products`; delivery address visible to partner only while `assigned`/`picked_up` (existing policy). Per CLAUDE.md, list existing policies before adding any; no new write policies.
- Schema changes: `orders.recipient_phone` (see Customer phone number, sub-project A) and, added at the start of sub-project B (2026-09-30, Vishal's choice), nullable `orders.accepted_at` / `picked_up_at` / `delivered_at`, stamped by a single `BEFORE UPDATE` trigger on `orders` when `status` changes (covers every status writer; old orders stay null). Nothing else.
- Store (pickup) address comes from the existing `stores.address_id` via an `addresses!address_id` embed — no schema change; stores without an address show "Address not on file".

## Customer phone number (added 2026-09-30)

- Captured at checkout alongside name and email, on web and mobile (mobile checkout gets the field in sub-project A so it never breaks against the new API).
- Required; Indian 10-digit mobile, optional `+91`/`91`/`0` prefix, starts 6-9; stored normalized as `+91XXXXXXXXXX` in `orders.recipient_phone text not null`. Validation is server-side in `POST /api/cart/checkout` and client-side in both checkouts; web and mobile validators are byte-identical (sync-tested).
- Existing orders are backfilled with the literal `Not provided` (user's choice); the UI shows any value not starting with `+` as plain text. No DB CHECK constraint.
- Not prefilled (checkout fields must never persist across sessions).
- Available everywhere the recipient appears: customer order detail, vendor card + dialog, delivery dashboard (only for orders the partner has accepted, i.e. assigned/picked_up — never on available cards or in History, matching the address-access window; ruling made in sub-project B's final review, flip it in `lib/delivery-order-view.ts` if the phone is wanted in History) and admin order detail (via the shared `OrderDetail`), mobile customer and delivery order views (D), and n8n (`notification-details` returns it; the delivered email includes it in the order details) (C). The phone is also in the database as above.
- `checkout_place_order` RPC gains `p_recipient_phone` (old signature dropped, per the project's RPC-signature rule).

## Customer (web + mobile)

- Timeline mapping: placed=0, accepted=1, preparing=2, ready=3, assigned/picked_up=4, delivered=5. Typed `Record<Exclude<OrderStatus,"cancelled"|"rejected">, number>`; cancelled/rejected keep the red banner.
- Orders list: store, date, status pill, item thumbnails/count, total.
- Order detail: timeline, items with images, address, payment, subtotal/fee/total.
- Vendor accept already updates `orders.status` and triggers n8n workflow 03 (accept email); customer page polls every 3s, so acceptance appears without new n8n work. Mobile polls likewise.

## Vendor (web)

- Orders API adds recipient name/email, address, product image, payment.
- Board cards: larger type, colored status headers, recipient, full address, items with photos, notes, payment, amount; click opens full detail.
- 10s polling on the board.

## Delivery (web + mobile)

- Nav: Dashboard (active) and History (delivered/cancelled/rejected).
- Dashboard: active only (available, assigned, picked_up). Cards show store + pickup address, recipient, full drop-off address, items summary, amount; address block replaces the "View address" button.
- History: new page and API filter by terminal status, newest first, limited.

## Admin (web only)

- Sidebar: Overview (KPIs), Orders, Vendors, Delivery Partners. `AdminShell` gets a nav links array.
- Orders table: customer, store, status, amount, partner. Order number links to `/admin/orders/[id]` showing `OrderDetailView` plus reassign control.
- Vendors / Partners: list + Add form. New `POST /api/admin/vendors` and `/api/admin/delivery-partners` behind `resolveAdmin`, mirroring `vendor-signup` / `delivery-signup` including rollback (delete auth user on failure). Validation reuses `lib/signup-validation.ts`.
- Keep the portal route-group rule: any new shell pages stay under `app/admin/(portal)/`. New dynamic `[id]` pages that fetch client-side need a sibling `loading.tsx`.

## n8n delivered email

- Extend `app/api/internal/orders/[id]/notification-details/route.ts` with items (name, qty, price, image URL), totals, address, `recipient_phone`, and use `recipient_email`.
- Workflow 05: on `delivered`, GET details, send Gmail node: "Thank you for your order. Your order has been successfully delivered. Please let us know your experience." plus HTML item table with images and totals.
- Verify the webhook payload is populated (n8n_notify lesson), then run the workflow live against local n8n.

## Sub-projects (each: plan -> build -> live verify -> merge to main)

- A: shared foundation + customer phone (DB, API, web + mobile checkout) + web Customer + web Vendor.
- B: web Delivery + web Admin.
- C: n8n delivered email.
- D: Mobile Customer + Delivery, then both manuals (web + mobile, docx + pdf) updated in place with python-docx, static TOCs renumbered, screenshots from a production build.

## Web/mobile status parity (requirement from the user)

After sub-project D the mobile status mapping must match the web mapping exactly: `mobile/lib/order-status.ts` is updated to the same 6 steps and index map as `lib/order-status.ts`, and D adds a node test that reads both files and asserts the status list, timeline labels and index map are identical (mobile cannot import the web module, so a sync test is the guard). Until D merges, mobile keeps the old 4-step mapping; that interim gap is known and accepted.

## Execution decisions

- Branch per sub-project in the main checkout (a worktree would need `npm ci`, which needs approval). Tasks executed via subagent-driven development with per-task review and a final whole-branch review.
- Tasks 7 and 8 of sub-project A (vendor API + vendor page) are committed together.
- No test framework yet (POC): pure-logic tests use `node --test`; a proper framework is a later decision.

## Verification

Every sub-project: `tsc`, `npm run build`, live Playwright across affected portals (login surfaces included), API checks with curl/psql for data shape. Mobile: type-check; no device/simulator run exists yet, so state that explicitly. Final whole-branch review per sub-project.

## Open notes

- Mobile stepper change is included in D, not A.
- Existing manuals describe the pre-redesign mobile flow; D refreshes them fully.
