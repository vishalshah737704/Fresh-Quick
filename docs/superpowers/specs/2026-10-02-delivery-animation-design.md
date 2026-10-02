# Delivery Animation Popup - Design

Date: 2026-10-02. Status: awaiting written-spec approval.
Surfaces: web customer order page, mobile Customer order detail screen.

## 1. Goal

When the delivery partner picks up an order, the customer's screen shows a
non-dismissible popup with a 15 second animation of a Fresh & Quick courier
cycling to deliver the order. The bike's delivery box carries the Fresh & Quick
logo and name. When the animation completes the customer sees "Delivered", and
only then does the order become `delivered` and n8n's delivered workflow (the
email) fire.

Approved assets (sample files reviewed 2026-10-02, scratchpad only):
- Rider: 2D illustrated SVG scene, "v2" (orange-jersey courier, helmet, city
  bike, scrolling street, sunlit city).
- Logo: concept A - white disc, orange lightning bolt, green leaf.

## 2. Decisions already made with Vishal

| Topic | Decision |
|---|---|
| Who sets `delivered` | The customer's app, after the 15 s animation ends |
| Surfaces | Web + mobile |
| Rider look | 2D SVG v2 (3D and Pexels footage rejected; Pexels has no 3D models) |
| Logo | A (bolt + leaf); no real logo asset existed in the repo |
| If the customer never completes it | Server auto-completes (see 5) |

## 3. Status flow

```
assigned --partner--> picked_up --customer app, 15 s--> delivered --> n8n 05 delivered branch (email)
                          \--n8n 05 wait 5 min, still picked_up--> delivered (fallback)
```

- `picked_up_at` already exists (migration 27, set by trigger). It is the
  animation clock.
- The DB trigger and n8n workflow 05 delivered branch are unchanged and keep
  firing off the `delivered` status change. This is what guarantees n8n runs
  only after the animation (or after the fallback).
- Partner side: remove the `picked_up -> delivered` entry from
  `DELIVERY_STATUS_TRANSITIONS` (`lib/order-constants.ts`) so
  `/api/delivery/orders/[id]/status` can no longer deliver. Partner active card
  shows "Customer is receiving the order" for `picked_up` instead of the
  deliver button. Admin reassign is untouched.

## 4. Server

### 4.1 `POST /api/customer/orders/[id]/complete-delivery`
- Identity from `Authorization: Bearer <token>` verified with
  `supabaseServer.auth.getUser(token)` (project rule; never a body-supplied id).
- Order must have `customer_id` = verified user. Otherwise 404.
- Status `delivered`: return 200 `{order}` (idempotent, so retries are safe).
- Status other than `picked_up`: 409.
- `now - picked_up_at < 14 s`: 425 `{ error: "too early", retryAfterMs }`.
  (15 s animation, 1 s clock-skew tolerance.) This makes the n8n-after-animation
  rule server-enforced, not client-trusted.
- Update `status = 'delivered'` with `.eq('status','picked_up')` guard (race-safe);
  0 rows -> re-read and apply the idempotent rule.

### 4.2 `POST /api/internal/orders/[id]/complete-delivery`
- Guarded by the existing internal-secret check (`lib/internal-auth.ts`).
- Same update, but no customer check and no 14 s rule (n8n only calls it after
  its own 5 min wait). Idempotent.

### 4.3 n8n workflow 05 (JSON edit, `n8n/workflows/05-...json`)
- New branch off the `picked_up` outcome: Wait 5 min -> POST internal
  complete-delivery directly (it is idempotent and a no-op unless the order is
  still `picked_up`, so no separate status check is needed). The delivered email
  then fires through the existing delivered branch because the status change
  re-triggers the webhook.
- 4.2 returns 200 with the current status if the order is already `delivered`,
  and 409 for any other non-`picked_up` status (e.g. cancelled); n8n treats both
  as done.
- Per the project rules: wrap `.includes()` in `String(...)`; never commit a
  real credential id; reuse `$env.APP_BASE_URL` (must be reachable from the n8n
  container via `host.docker.internal`).

## 5. Fallback

5 minutes after `picked_up`, if the customer has not completed the animation
(app closed, offline), n8n completes the delivery via 4.2. Chosen value: 5 min
(animation is 15 s; 5 min gives ample time for a phone to reopen and play it).

## 6. Web UI

- `components/DeliveryAnimationDialog.tsx`: SVG scene ported from the approved
  sample (courier with IK-driven legs, spoked wheels, parallax street, delivery
  box). Props: `startOffsetMs`, `durationMs = 15000`, `onComplete`.
- `components/BrandLogo.tsx` + path data in `lib/branding.ts`: logo A and the
  name come from branding, not hardcoded in the dialog.
- Customer order page (`app/customer/orders/[id]/page.tsx`): when polled status
  is `picked_up` and `picked_up_at` exists, render the dialog. Offset =
  `clamp(now - picked_up_at, 0, 15 s)`, so reopening mid-animation resumes and
  after 15 s completes immediately. `ORDER_DETAIL_SELECT` / `normalizeOrderDetail`
  must expose `pickedUpAt`.
- On completion: call 4.1 with the session token. 425 -> wait `retryAfterMs`
  and retry; network error -> retry with backoff; success -> close dialog,
  refresh order (poll already does this) and show Delivered state.
- Not dismissible (no close button, no Escape, no backdrop click).
- `prefers-reduced-motion`: static scene plus progress bar and countdown.
- Header and ARIA: `role="dialog"`, `aria-modal`, live region announcing
  "Your order is on the way" then "Delivered".

## 7. Mobile UI

- `mobile/src/components/DeliveryAnimation.tsx` using `react-native-svg`
  (new dependency, installed with `npx expo install react-native-svg` **only after
  Vishal approves**), rendered in a `Modal` on
  `mobile/src/app/customer/orders/[id].tsx`.
- Scene constants and leg/pedal math in `mobile/lib/delivery-animation.ts`, a
  byte-identical copy of the web module, guarded by a parity test like
  `tests/mobile-parity.test.mjs`.
- Same offset/resume, completion call, retry and non-dismissible rules. The
  Android hardware back button is disabled while the modal is open.

## 8. Out of scope

- Real map/ETA, sound, partner-side animation, vendor/admin changes.
- Delivery partner "History" lags until completion (accepted).

## 9. Testing and verification

- Route unit tests: no token, wrong customer, wrong status, too early (425),
  success, idempotent repeat, race (already delivered).
- Internal route: secret required, idempotent.
- Mobile parity test for the shared animation module.
- Live Playwright run: partner pickup -> popup appears -> Delivered after 15 s;
  check the n8n execution for 05 started at or after `picked_up_at + 15 s`,
  and that calling the customer endpoint at t < 14 s is rejected.
- Fallback: with the customer not on the page, confirm delivery completes about
  5 min after pickup and the email sends.
- `npm run build`, lint, and tsc must pass. Drive the login/UI surfaces in a
  browser, not just curl (project rule).
- Reduced-motion and resume-mid-animation checked manually.

## 10. Risks

- Customer-device clock skew vs `picked_up_at`: handled by the 14 s server rule
  plus retry, and by the 5 min fallback if everything fails.
- Mobile 3 s polling means the popup may start up to 3 s after pickup; the offset
  logic uses `picked_up_at` so the total still ends at pickup + 15 s.
- n8n 5 min Wait nodes need the workflow to stay active; document in
  `docs/n8n-webhook-setup.md`.
