# Ask Zippy Z5: order-note cards and the accumulated follow-ups

Date: 2026-10-04. Approved to run autonomously by Vishal ("Perform 6 & 7"); decisions below were taken by the controller.

## Part A: Zippy can set the order note (suggestion 6)

### Intent

The cart has an "Order note" (it becomes the order's delivery note, up to 500 characters, shown on the order to the store and the delivery partner). Z4a deliberately left it out because the note is free text that other people read. Add it back safely: a signed-in customer says "add a note: no onions, ring the bell twice" and Zippy proposes a card showing the exact text; nothing changes until the customer taps Confirm.

### Design

1. **New card kind** `set_order_note`: `{ kind, id, title, description, text, cartStoreId }`. `text` is the full new note (empty string means clear). `description` is built server-side and shows everything the card will do: `Set your order note to: "<text>"`, `Replace your order note "<current note>" with: "<text>"` (current note shortened to 80 characters for display) or `Clear your order note ("<current note>")`.
2. **New tool** `propose_order_note` with input `{ text: string }` (0 to 500 characters after sanitising; empty clears). It refuses when the cart is empty or when there is no cart snapshot (same errors as the other cart tools). The snapshot now carries the cart's current `orderNote` (client-supplied, sanitised and capped like other snapshot text) so Zippy can say replace versus set; an unknown note is treated as empty.
3. **Text rules:** the text must be the customer's own words from this conversation. The prompt says so, forbids copying text from dishes, stores, orders or tool results into a note, and forbids notes the customer did not ask for. The text is sanitised server-side (tags and control characters stripped, line breaks to spaces, whitespace collapsed, 500 characters max); the card shows the sanitised text in quotes so the customer sees exactly what will be saved.
4. **Gating and conflicts:** same as the other cart cards (signed-in customer, `ZIPPY_ACTIONS` on, at most 3 cards, never together with a checkout card; it counts as a cart card). Needs no orders access.
5. **Execution** (shared `executeAction`, byte-identical web and mobile copies): `CartApi` gains `setOrderNote(text)` (both cart stores already have it). At tap time the live cart must still be non-empty and its store must equal the card's `cartStoreId`, else the existing "Your cart changed, ask me again." message; success message "Order note saved." / "Order note cleared."
6. **Clients:** web and mobile card components already render `title` and `description`; the card kind needs only a label ("Confirm") and the snapshot sender adds `orderNote` (`snapshotCart` in the shared `client-cart.ts`).
7. **Knowledge and manuals:** the cart answer says Zippy can set or clear the order note after you confirm; both manuals' Ask Zippy chapters get one bullet.

## Part B: follow-ups collected from the Z4a, Z4b, streaming and rate-limit reviews (suggestion 7)

1. **Retry after a thrown error:** when confirming a card throws (not when the result is "cart changed"), the card shows the message and a "Try again" button instead of dead text (web and mobile; the executed-id guard is released on a thrown error only).
2. **Option prices on cards:** add and reorder card text shows each option with its extra price (for example "Spice level: Extra spicy (+₹20)"), computed from the option's integer paise.
3. **Rate-limit IP hygiene:** per-IP buckets use the IPv6 /64 prefix (so one household or attacker cannot mint unlimited buckets from one IPv6 range) and the IP hash is salted with an optional `ZIPPY_IP_HASH_SALT` (hashing stays unsalted when the variable is unset, so existing behaviour does not change by default).
4. **Test gaps** recorded in the reviews: boundary quantities 1 and 20, snapshot validation tables (price bounds, string quantity or price, long names, omitted store fields, extras dropped), duplicate lines, 50 lines times quantity 20, newest-first for the "latest" reorder, null `order_item_options` and whitespace-only notes, the tools-off prompt with knowledge chunks present, and a vendor-role case in `selectActionTools`.
5. **Small code fixes:** `loadProductsForCart` validates ids as uuids itself; one shared sanitiser length constant instead of 60 and 80 mixed; NaN/Infinity guards in the reorder builder; `addItems` with `replace=false` clears an open `pendingConflict` (web and mobile stores); mobile takes the cart snapshot before awaiting the location permission; mobile aborts its stream request on unmount (like web); hard-coded colors and 32 px buttons on the web cards replaced with the brand tokens and a 40 px minimum height.
6. **Not included:** a mobile card figure in the manual (needs a new iPhone recording); web `sendChat` removal is also skipped (it is kept for tests and as a fallback).

## Testing

Unit tests for everything pure (sanitiser, builders, tool inputs, refusals, prompt rules, executeAction, snapshot parsing, rate-limit IP normalisation and hashing, new boundary tables). Live with a real model on a spare instance and a throwaway customer: set, replace and clear an order note via cards (the saved note visible in the basket's Order note box), refusal with an empty cart, a note-injection attempt through a dish description (must not appear in any card), option prices on a card with a temporary option group (restored afterwards), the combined "add and note" request (two cart cards allowed, no checkout card), a real-browser tap of the note card and the retry path (simulated failure is not practical; covered by unit tests and code review). A phone check of the note card stays Vishal's.
