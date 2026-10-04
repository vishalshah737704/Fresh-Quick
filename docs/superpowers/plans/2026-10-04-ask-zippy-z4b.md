# Ask Zippy Z4b Implementation Plan

> Spec (binding): `docs/superpowers/specs/2026-10-04-ask-zippy-z4b-design.md`. Execute with `superpowers:subagent-driven-development`. Follow the Z4a patterns in `lib/zippy/actions.ts`, `tools.ts`, `prompt.ts`, `components/zippy/ActionCards.tsx`, `mobile/components/ZippyActionCards.tsx`.

**Goal:** a signed-in customer's "check out" gets a `go_to_checkout` card whose button opens the existing checkout page. Zippy never places or pays.

**Global constraints:** shared files `lib/zippy/action-types.ts` and `action-exec.ts` have byte-identical copies in `mobile/lib/` (tests guard drift); node-testable modules cannot value-import siblings (pure server modules take helpers via injected `deps`; `tools.ts` is `server-only` and untestable by node); no prices on the card; no package installs; never `tsconfig.json`, `.superpowers` or `md_version` in a commit (md_version and .superpowers are git-ignored); commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; run `node --test tests/*.test.mjs`, `npx tsc --noEmit` and `cd mobile && npx tsc --noEmit` before each commit.

## Task 1: Shared card type and executeAction (web + mobile copies)

Files: `lib/zippy/action-types.ts`, `lib/zippy/action-exec.ts`, `mobile/lib/action-types.ts`, `mobile/lib/action-exec.ts`, `tests/zippy-action-exec.test.mjs`.
- Add to `ActionCard`: `{ kind: "go_to_checkout"; id: string; title: string; description: string; storeId: string; storeName: string; itemCount: number }`.
- `executeAction` case `go_to_checkout`: if `cart.storeId !== card.storeId` return `{ ok: false, message: CART_CHANGED_MESSAGE }`, else `{ ok: true, message: "Opening checkout." }`; it never mutates the cart. Export a tiny helper `isNavigationCard(card)` is NOT needed; the component checks `card.kind`.
- `CartApi` stays unchanged. Because the web card must work without a cart provider, the web component handles the null-cart case itself (Task 3).
- Tests: ok on matching store, CART_CHANGED on different store and on an empty cart store (`storeId` null), no mutation calls recorded, copies byte-identical (existing parity test).

## Task 2: Server card, tool, gating and prompt

Files: `lib/zippy/actions.ts`, `lib/zippy/tools.ts`, `lib/zippy/prompt.ts`, tests in the existing zippy action/prompt/tools-selection test files.
- `buildCheckoutCard(cart, products, deps)` (pure, in `actions.ts`): input is the validated `CartSnapshot` and a `Map` of live products (reuse `ProductForCart`/`loadProductsForCart`; a snapshot lineId starts with the menu item id before `::`: derive it the way Z4a's cart-change code derives ids, or from the snapshot's own field if present). Refuse with a clear model-facing error when: cart null/empty or `storeId` null; the store is closed or suspended (reuse `storeProblem`); any referenced dish is missing or unavailable (name it). On success the card is `{ kind: "go_to_checkout", id: deps.newId(), title: "Go to checkout", description: "Open checkout for N item(s) from <sanitized store name>. You enter your details and pay yourself; Zippy does not place the order.", storeId, storeName, itemCount }`, where `itemCount` is the sum of line quantities and all text is sanitized and within the description length limit.
- Tool definition `propose_go_to_checkout` (no input, `strict`, `additionalProperties: false`), added to the action tool list with the same gating as the other action tools (signed-in customer, `actionsEnabled`; hidden otherwise; `selectActionTools` already filters by role/flags: extend it). `tools.ts` case: `actionsAllowed` check, load live products for the cart's dish ids with `loadProductsForCart`, build, `pushCard`; a second checkout card in the same reply is refused ("already prepared").
- Prompt rule in `prompt.ts` (only when actions are on): propose it only when the customer asks to check out or place the order; say that Zippy cannot place or pay, that the card opens checkout where they enter their own details and pay; never ask for or repeat recipient details, address or payment details; remove or reword any existing rule that says Zippy cannot help with checkout in a way that now contradicts this (re-read all action rules and the orders rule).
- Tests: builder (success, empty cart, closed store, suspended, unavailable dish, sanitized name, itemCount, description length), tool list per role/flags (visitor/vendor none, customer yes, `ZIPPY_ACTIONS=off` none), prompt contains the new rule and no contradiction in orders-on/orders-off variants.

## Task 3: Web and mobile cards

Files: `components/zippy/ActionCards.tsx`, `components/zippy/ZippyWidget.tsx` (close the panel on navigation), `mobile/components/ZippyActionCards.tsx`, `mobile/components/ZippyFab.tsx` (close the modal on navigation).
- Render a primary button "Go to checkout" (and Dismiss) for `go_to_checkout` cards. On tap: guard with the executed-ids ref; when a cart is available run `executeAction` first and stop with its message if `ok` is false; then navigate to `/customer/checkout` (web `useRouter().push` and call an `onNavigate` prop that closes the widget; mobile `router.push("/customer/checkout")` after closing the modal) and show "Opening checkout." The web card needs no cart provider (when `cart` is null skip the store check and just navigate).
- Keep the Z4a lessons: cards survive follow-up messages, try/catch around the handler, double-tap navigates once.
- No new tests for components (no React test runner); tsc on both apps must be silent.

## Task 4: Knowledge and eval fixtures

Files: `knowledge/customer/ask-zippy.md`, `knowledge/glossary.md`, `tests/fixtures/zippy-eval.json`.
- In the "Can Zippy add things to my cart?" answer (and the "see or place an order" answer if it conflicts), say Zippy can also open checkout for you with a card, but you enter your details and pay yourself; Zippy never places or pays for an order. Glossary "What is Zippy?" likewise. Fact-check against the code. Add two eval cases (`expectTitleIncludes` equals an existing `##` heading): "can zippy check out for me" and "take me to checkout".
- `node --test tests/*.test.mjs` passes (knowledge tests check structure).

## Task 5: Live verification (controller)

Throwaway customers (`a-z4b@example.invalid`), spare instances from the worktree on 3010/3011 (`npx next build --webpack`, `npx next start`), checks per the spec's Testing section, one real-browser tap via Playwright that lands on `/customer/checkout` with the cart intact and a double-tap check, temporary dish/store edits restored, test rows deleted, counts back to baseline (orders 2, order_items 5, payments 2, customers 3, auth_users 85, products 2922, stores 77). Never place an order (Gmail is live).

## Task 6: Docs, final review, PR

Manuals edited in place (web v3.5, mobile v4.6), README/CLAUDE.md/MEMORY.md Z4b entries (and the lesson list), final whole-branch review on the most capable model, one fix wave plus a scoped re-review, `npm run build` after merge, push, PR. Merge only when Vishal says "you merge it".
