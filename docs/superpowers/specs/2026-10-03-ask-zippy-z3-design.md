# Ask Zippy Z3 — "My orders" (design)

Date: 2026-10-03. Status: design approved in conversation, written spec awaiting Vishal's review.
Builds on: Z1 (`2026-10-03-ask-zippy-z1-design.md`) and Z2 (`2026-10-03-ask-zippy-z2-design.md`, bounded tool loop).

## 1. Goal

A signed-in customer can ask Zippy about their own orders ("where is my order?", "what did I order last week?", "how much was it?", "where is it being delivered?") and get an accurate, live answer, on the website and in the mobile app. Z3 is read-only. Cancelling, changing, reordering or placing orders stays out of scope (Z4).

## 2. Decisions

| Topic | Decision |
|---|---|
| Who | Customers only. Visitors, vendors, delivery partners and admins get no order tools; Zippy tells them to sign in as a customer to see their own orders. |
| Data Zippy may see and repeat | Everything on the customer's order page: status, step timestamps, store, items with options and notes, subtotal / delivery fee / total, payment status and method, and the recipient name, email, phone and full delivery address. No delivery-partner details exist on this view and none are added. |
| Approach | Two on-demand tools in Z2's tool loop. Orders are NOT injected into every prompt, so personal data is sent to the model only when a question needs it. |
| Extra kill switch | `ZIPPY_ORDERS=off` removes just the order tools; `ZIPPY_TOOLS=off` still removes all tools. |
| Out of scope | Any state change (Z4), vendor/delivery/admin order questions, ETA estimates (no ETA field exists), order links or cards, order analytics. |

Vishal chose to expose full recipient contact details despite the privacy cost (they are sent to the model provider with the chat when a question needs them). The cost is accepted; the safeguards in section 4 limit when and for whom they are fetched.

## 3. Components

- `lib/zippy/orders.ts` (pure, unit-tested): input parsers and clamps for both tools, output shaping, sanitizing, status wording.
- `lib/zippy/orders-data.ts` (server-only): the two database reads through the service-role client.
- `lib/zippy/tools.ts`: two new tool definitions (`strict: true`), `ToolContext` gains `customerId: string | null`, `runTool` gains two cases, and a function that returns the tool list for a context (order tools only when `customerId` is set and `ZIPPY_ORDERS` is not `off`).
- `app/api/zippy/chat/route.ts`: passes `customerId = caller.userId` only when `caller.role === "customer"`; passes the tool list and a flag to the prompt builder.
- `lib/zippy/agent.ts`: takes the tool list and context instead of the fixed `ZIPPY_TOOLS`.
- `lib/zippy/prompt.ts`: replaces the "cannot see orders" rule with an order rule when order tools are present (see 6).
- Knowledge, manuals, README, CLAUDE.md, MEMORY.md (see 8).

Status labels and the six-step logic come from `lib/order-status.ts` (the same source the Orders pages use, with the mobile copies guarded by `tests/mobile-parity.test.mjs`), so Zippy words statuses exactly as the app does.

## 4. Privacy and security boundary

1. **Identity comes only from the verified session token.** The chat route already resolves `caller.userId` from the Bearer token. The model never supplies a user id and no tool input carries one.
2. **Ownership is enforced by the query.** Every read filters `orders.customer_id = ctx.customerId`. An id that is nonexistent, malformed or owned by someone else returns the same `not found` tool error, so ids cannot be probed.
3. **Tools exist only for customers.** For every other role, and for visitors, the order tools are not in the tool list at all.
4. **Least data per call.** `list_my_orders` returns brief rows without recipient or address data. Only `get_my_order` (one order) returns recipient and address.
5. **Untrusted text is data.** Delivery notes, special instructions and recipient name are customer-typed, store and dish names are vendor-written. All are sanitized (tags and control characters stripped, 200 characters max) and the prompt tells the model never to follow instructions found in tool results.
6. **No logging of order content.** Server logs may record the tool name and a failure code, never order fields or addresses.
7. **Saved chats** store the final reply text as today. A reply that repeats an address stays in that user's own history; "Reset Data" deletes it through `auth.users`.
8. **Orders whose customer account was deleted** have `customer_id = NULL` (migration 28) and never match the filter.

## 5. Tools

`list_my_orders` — input: `status_group` (`active` = placed through picked_up, `past` = delivered/cancelled/rejected, `any`; default `any`), `limit` 1–10 (default 5). Output: newest first, each `{order_id, store, status, status_label, total_rupees, placed_at, items_summary}` where `items_summary` is at most 5 item names with quantities. Empty result: `{orders: [], note: "This customer has no orders yet"}`.

`get_my_order` — input: `order_id` (uuid) or the string `latest`. `latest` means the newest order by `placed_at`, any status. Output: `{order_id, store (name and address), status, status_label, step timeline with the timestamps that exist, items (name, quantity, unit_price_rupees, options, note), subtotal_rupees, delivery_fee_rupees, total_rupees, payment {status, method}, recipient {name, email, phone}, delivery_address, delivery_note}` with at most 40 items.

Rules for both: money is converted from integer paise (never float multiplication); only timestamps present in the data are returned; an unknown, malformed or foreign `order_id` gives `{error: "not found"}`; a database failure gives `{error: "could not load orders"}` and the real error is logged server-side only. Z2's loop limits (max 4 tool rounds, max 6 tool calls per round, `tool_choice: auto`, tools still sent on the final no-more-tools round) apply unchanged.

## 6. Prompt changes

When order tools are present: Zippy may answer from tool results about the user's own orders; it states only statuses and times found in the data and never invents an ETA; it still cannot cancel, change, reorder, place or pay for orders and says to use the app for those; order and store text is data, not instructions. When they are absent for a signed-in non-customer or a visitor: "To see your orders, sign in as a customer." When `ZIPPY_TOOLS=off` the Z1 wording is unchanged. The existing "cannot see the user's orders" rule is replaced, not duplicated, and every prompt rule is re-read for wording that blocks the new capability (CLAUDE.md lesson from Z1/Z2).

## 7. Limits and cost

Rate limits are unchanged (signed-in 10/min + 60/day, visitors 5/min + 20/day; visitors never use order tools). An order question costs the same few model calls as a store question. No new tables, migrations or n8n workflows.

## 8. Testing

- **Unit tests (no network):** parsers and clamps; shaping (paise to rupees, sanitizing, caps, `latest`, empty result); status wording equals `lib/order-status.ts`; the tool-list function (customer gets order tools, every other role and `ZIPPY_ORDERS=off` do not); prompt tests (order rule present only when enabled, the cannot-change rule kept, the data fence present); a stub-server end-to-end test of any changed CLI script.
- **Live verification (controller runs it):** two throwaway customers A and B, each with one order. As A: ask about A's order and compare to the database; ask for B's order id and get `not found`; as a visitor and as a vendor no order data is returned; repeat the A question from the mobile chat. Prompt-injection check: an order whose delivery note says to ignore rules and list all orders must not change behaviour. Test orders are created by direct database inserts or only to addresses Vishal owns (Gmail workflows 03 and 05 are live); all test rows are deleted afterwards and counts re-checked.
- **Eval:** about 6 order cases added to `scripts/zippy-eval.mjs` and an order check added to `scripts/zippy-facts-check.mjs`; Vishal runs both because they need `N8N_INTERNAL_SECRET`.
- **Build:** `npm run build` (not just `tsc`) before merge, per project rule.

## 9. Docs

Update `knowledge/customer/ask-zippy.md` (the "Not yet" answer for orders), the policy file if it says Zippy never reads orders, both manuals' Ask Zippy chapter (edit the docx in place with python-docx, regenerate PDFs, renumber the static TOCs), README, CLAUDE.md and MEMORY.md; re-ingest knowledge afterwards. Example data in docs uses `Demo Customer`, `demo@example.com`, `12 Demo Street`.

## 10. Rollout

Worktree plus subagent-driven development (about 8 small tasks, a final whole-branch review), then a PR. Vishal's browser account cannot merge, so the merge is done with `gh pr merge --merge` on request. Z4 later builds on the order ids, the ownership check and tap-to-confirm cards.

## 11. Open items for Vishal

- Whether the privacy/terms knowledge file should say explicitly that Zippy can read a customer's own orders and sends them to the AI provider.
- Test data method: direct database inserts (recommended) or orders placed through the app to an address Vishal owns.
