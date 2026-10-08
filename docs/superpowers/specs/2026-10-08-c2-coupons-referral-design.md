# C2 — Coupons, promo codes, wallet credit and referrals (design)

Date: 2026-10-08. Status: approved by Vishal's standing instruction to run autonomously (no per-step approval). Third of the four sub-projects chosen from `docs/Enhancements.docx` (items C2, C6, V3, A4). C4 (notifications) is the next spec.

## 1. Goal

A customer can type a promo code at checkout (web and phone) and get a discount; vendors create coupons for their own store; the admin manages platform-wide coupons and sees redemption counts; every customer has a referral code and a wallet that holds credit earned from referrals, spendable at checkout.

## 2. Rulings (decisions taken on Vishal's behalf)

| # | Ruling | Cost if wrong |
|---|---|---|
| R1 | Coupon types: `percent` (1-100) and `fixed` (paise). Discount applies to the SUBTOTAL only, never the delivery fee, and never exceeds the subtotal. | Free-delivery coupons need a new kind later. |
| R2 | Optional per-coupon rules: `max_discount_paise` (percent cap), `min_order_paise`, `valid_from`/`valid_until`, `total_limit`, `per_customer_limit` (default 1), `first_order_only`, `is_active`. | none |
| R3 | One coupon per order. A coupon may be combined with wallet credit. | Stacking of several codes is not possible. |
| R4 | Scope: `store_id null` = platform (admin only); `store_id` set = that store only (vendor or admin). Codes are globally unique, case-insensitive, stored upper-case. | A vendor cannot reuse a code the platform has. |
| R5 | Vendors are limited to percent <= 50 and fixed <= Rs 500; the admin has no cap beyond the schema. There is no vendor payout in this app, so the platform/vendor cost split is not modelled; the discount just lowers the order total. | If payouts are added later, a `funded_by` column is needed. |
| R6 | A redemption counts against limits while its order is not cancelled/rejected. Cancelled/rejected (including failed payment) RELEASES the redemption and refunds any wallet credit used (trigger). | none |
| R7 | Atomicity: `checkout_place_order` locks the coupon row (`FOR UPDATE`) and the customer row before counting, so two simultaneous checkouts cannot exceed a limit or overspend credit. | none |
| R8 | `orders` gains `discount`, `credit_used` (numeric rupees like the other money columns) and `coupon_code`; the check constraint becomes `total = subtotal + delivery_fee - discount - credit_used`. The server recomputes everything from the database; a client-sent amount is only compared (mismatch -> 409 "prices changed"). | none |
| R9 | `stores.promo_text` stays a free-text banner (untouched). | A banner and a real coupon can disagree; the vendor must keep both honest. |
| R10 | Wallet = append-only ledger `wallet_ledger` (signed integer paise, balance = sum, no update/delete, service-role only). It holds referral credit only; no top-up, no card data. Spending credit at checkout is a `spend` entry; a refused/cancelled order writes a `refund` entry. | none |
| R11 | Referral: every customer gets a code lazily (8 characters). A new customer may enter one at sign-up (web and phone, optional; an invalid code is a 400 BEFORE the account is created). When the referred customer's FIRST order reaches `delivered` with subtotal >= Rs 100, both sides get Rs 50 credit (once, idempotent). Self-referral is impossible (the code belongs to someone else's account); a referrer earns at most 10 rewards. | Amounts are constants in the trigger function; change by migration. |
| R12 | Customers cannot buy credit or transfer it. Credit never expires. | none |
| R13 | Reset Data deletes redemptions, ledger, referrals and referral codes (customer data). Coupon DEFINITIONS (admin and vendor) are catalogue data and are KEPT. | none |
| R14 | Zippy: knowledge Q&As explain coupons, referral and wallet. Cart/checkout cards stay price-free. | none |
| R15 | Emails: the accepted and delivered emails show a "Discount" and "Wallet credit" line when non-zero. | none |

## 3. Data model (migration 38)

* `coupons`: id, code (unique on `upper(code)`), description, kind, value, max_discount_paise, min_order_paise, store_id (null = platform), created_by, valid_from, valid_until, total_limit, per_customer_limit, first_order_only, is_active, created_at. RLS on, no policies (service-role only).
* `coupon_redemptions`: id, coupon_id, customer_id, order_id (unique), discount_paise, status `applied|released`, created_at.
* `wallet_ledger`: id, customer_id, amount_paise (non-zero), kind `referral_reward|referral_bonus|spend|refund|adjustment`, order_id, referral_id, note, created_at; unique partial indexes make spend/refund once per order and referral rewards once per (referral, kind).
* `referrals`: id, referrer_id, referred_id (unique), status `pending|credited`, created_at, credited_at.
* `users.referral_code` (unique).
* `orders`: `discount`, `credit_used`, `coupon_code` + replaced constraint.
* SQL functions (SECURITY DEFINER, `search_path = ''`, execute for service_role only): `wallet_balance_paise(uuid)`, `ensure_referral_code(uuid)`, `coupon_check(code, customer, store, subtotal_paise)` (the single rule engine used by the preview route AND the checkout RPC), `checkout_place_order(... , p_coupon_code, p_use_credit)` (old signature dropped), triggers `orders_release_on_cancel` and `orders_referral_reward`.

## 4. API

Customer (Bearer token, identity from the token): `POST /api/customer/coupons/preview {storeId, subtotalPaise?}`-style check, `GET /api/customer/wallet` (balance + ledger page + referral code + referral stats), `GET /api/customer/coupons/available?storeId=` (active public coupons for the checkout hint). Checkout route accepts `couponCode`, `useCredit`. Signup routes accept `referralCode`.
Vendor: `GET/POST /api/vendor/coupons`, `PATCH /api/vendor/coupons/[id]` (pause/resume, edit limits). Admin: `GET/POST /api/admin/coupons`, `PATCH /api/admin/coupons/[id]`, redemption counts and totals in the list.
Pure shared rules in `lib/coupon-model.ts` (code normalisation, validation of a coupon definition, discount maths, messages), byte-identical copy `mobile/lib/coupon-model.ts`, parity-tested.

## 5. UI

Web checkout: "Promo code" box (Apply / Remove), "Use wallet credit" checkbox with balance, order summary lines Discount / Wallet credit. Phone checkout: the same. Wallet page (web + phone): balance, referral code with copy/share, ledger list. Vendor portal: Coupons page. Admin portal: Coupons page. Order detail (all readers) shows discount and credit lines.

## 6. Verification plan

SQL test `supabase/tests/c2_coupons.sql` (rolled back): every rule, limit, race-free redemption, release on cancel, referral reward once. Unit tests for the pure model and parity. Live: curl matrix for each role, a real two-session concurrency test on the coupon limit, browser check of web checkout, vendor and admin pages. Not driven live unless noted in the final report: phone UI (type-checked, lint) and Expo.

## 7. Out of scope

Free-delivery and BOGO coupons, auto-applied coupons, stacking codes, vendor payouts, wallet top-up/withdrawal, expiring credit.
