# C4 — Notifications (design)

Date: 2026-10-08. Status: approved by Vishal's standing instruction to run autonomously. Fourth sub-project from `docs/Enhancements.docx`; built in the same branch as C2.

## Goal
Every signed-in user (customer, vendor, delivery partner) has an in-app inbox with an unread badge; the phone app also receives Expo push; preferences control which categories and channels are used; SMS and WhatsApp are built but disabled.

## Rulings
| # | Ruling | Cost if wrong |
|---|---|---|
| N1 | The inbox row (`user_notifications`) is the source of truth and the "in-app" channel. It is created by SECURITY DEFINER database triggers (order placed/status changes, referral and wallet events), so no code path can forget to notify. | Texts live in SQL; changing wording needs a migration. |
| N2 | Recipients: customer (every order status), vendor (new order), delivery partner (assigned). Customer wallet events (referral reward, welcome bonus, refunded credit). | none |
| N3 | Preferences (`order_updates`, `wallet_updates`, `promotions`, `push`, `sms`, `whatsapp`) default on/on/on/on/off/off. A category switched off stops new inbox rows; `push` switches off push only. | none |
| N4 | Router: an insert on `user_notifications` fires the existing `n8n_notify` trigger to n8n workflow 10 (`foodhub/notify-dispatch`), which calls `POST /api/internal/notifications/dispatch` (internal secret). The route atomically claims undispatched rows (`dispatched_at`), plans channels with the pure `planDispatch`, sends Expo push, and Twilio SMS/WhatsApp only when `NOTIFY_SMS=on` / `NOTIFY_WHATSAPP=on` plus Twilio env vars and the user's own opt-in and an E.164 phone. Rows older than 24 h are marked dispatched without sending. | If n8n or workflow 10 is down, inbox still works; push waits. |
| N5 | Device tokens: one token belongs to one account (upsert on token), dead tokens (`DeviceNotRegistered`) are deleted. Registration is best-effort on the phone (Expo Go limits). | Android Expo Go cannot receive remote push at all. |
| N6 | Web surfaces: bell with unread badge (polls every 30 s) in the customer header, vendor and delivery shells; a Notifications page per portal with settings. Phone: Notifications screen for Customer and Delivery, row with badge on the Account tab / dashboard. Admin portal has no inbox. | none |
| N7 | Reset Data deletes all inbox rows, tokens and preferences of every role. | none |

## API
`GET /api/notifications`, `POST /api/notifications/read`, `GET/PUT /api/notifications/preferences`, `POST/DELETE /api/notifications/devices` (any signed-in role, identity from the token), internal `POST /api/internal/notifications/dispatch`.

## Not done
Tap-on-push deep link, marketing/promotion senders (the `promo` category and preference exist but nothing creates promo rows yet), admin inbox, email preference (emails remain controlled by n8n workflows 03/05).
