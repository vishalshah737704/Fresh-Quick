# Ask Zippy Z4b — "Go to checkout" card

Date: 2026-10-04. Builds on Z4a (cart actions with tap-to-confirm cards, merged in PR #9). Status: approved by Vishal to run autonomously ("make your judgement"); decisions below were taken by the controller and are listed so they can be corrected.

## Intent

A signed-in customer who has filled the cart with Zippy's help (or by hand) says "check out" or "place my order". Zippy cannot place or pay for an order and must not. Z4b gives it a safe next step: a card with one button that opens the checkout page, where the customer types their own details and pays. Success: one tap from chat lands on the existing checkout page for the current cart, Zippy never touches recipient details, address or payment, and nothing is ordered until the customer finishes checkout themselves.

Assumptions (corrections welcome): web and mobile Customer apps both get it; no money amounts on the card (the checkout page shows the real totals and fee); no change to the checkout page itself.

## Why only a hand-off

Checkout needs recipient name, email and phone, a full address with coordinates, and card or UPI fields that the app deliberately never saves between sessions. Users are told never to type card numbers into chat, and placing an order sends real email through n8n. So Zippy never places an order, never asks for those details, and never pays.

## Decisions

1. One new card kind, `go_to_checkout`: `{ kind, id, title, description, storeId, storeName, itemCount }`. It is a navigation, not a cart change: it needs no cart provider and runs no `addItems`.
2. One new read-only-style tool, `propose_go_to_checkout` (no input). It reads the validated cart snapshot the client sent, and refuses (a clear message, no card) when the cart is empty, the store is closed or suspended, or any dish in the cart is no longer available (the dishes are checked against the live database by id, the same way Z4a checks adds). The card text is built server-side: "Open checkout for N items from <store>. You enter your details and pay yourself; Zippy does not place the order." No prices on the card.
3. Same gating as Z4a: signed-in customers only, `ZIPPY_ACTIONS=off` (or `ZIPPY_TOOLS=off`) disables it, never offered to visitors, vendors, delivery partners or admins, never offered on a streaming request. At most one such card per reply (it counts toward the 3-card cap).
4. Client tap: web `router.push("/customer/checkout")` and the widget closes; mobile `router.push("/customer/checkout")` and the chat modal closes. The existing checkout page already handles a signed-out visitor (redirect to login) and an empty cart (its own empty state). If the live cart's store differs from the card's `storeId` when the cart is available, the tap returns the existing "Your cart changed, ask me again." message instead of navigating. A double tap navigates once (executed-ids ref guard, as in Z4a).
5. The web card works anywhere the widget shows (it needs no cart provider); the mobile card always works.
6. Shared client types stay byte-identical between web and mobile (`action-types.ts`, `action-exec.ts`): `executeAction` gains a `go_to_checkout` case that changes nothing and returns `{ ok: true, message: "Opening checkout." }`; the component performs the navigation.
7. Prompt: Zippy proposes the checkout card only when the customer asks to check out or place the order; it says it cannot place or pay and that the card opens checkout; it never asks for or repeats recipient details, an address or payment details; re-read every existing action rule for contradictions (Z1 lesson).
8. Knowledge: the cart answer and the "can Zippy place an order" answer say Zippy can open checkout for you but you enter details and pay yourself; two eval cases; re-ingest by Vishal after merge.

## Out of scope

Editing the order note, entering recipient details or address, choosing payment, placing or cancelling orders, showing totals on the card.

## Testing

Unit tests for the card builder, the tool input/refusals (empty cart, closed store, unavailable dish, other-store snapshot), tool gating, prompt rules, `executeAction`, and web/mobile file parity. Live: real model on a spare instance (card for a valid cart; refusals for empty cart, closed store, unavailable dish; visitor and vendor get none; `ZIPPY_ACTIONS=off`; injection through a dish description does not change the card), a real browser tap that lands on `/customer/checkout` with the cart intact, and a double-tap check. A phone tap stays Vishal's to check.
