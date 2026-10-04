# Zippy Rate Limits Implementation Plan

> Spec (binding): `docs/superpowers/specs/2026-10-04-zippy-rate-limits-design.md`. Execute with `superpowers:subagent-driven-development`.

**Global constraints:** node-testable modules cannot value-import siblings (node needs `.ts` extensions; `tsconfig.json` forbids them): `lib/zippy/rate-limit.ts` already imports only `node:crypto`; keep new pure helpers in files without sibling imports; the route is not node-importable; no migration; no package installs; never stage `tsconfig.json`, `.superpowers` or `md_version`; commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; run `node --test tests/*.test.mjs`, `npx tsc --noEmit` and `cd mobile && npx tsc --noEmit` before each commit. Do not start servers or call the model.

## Task 1: Pure limits module

Files: `lib/zippy/rate-limit.ts`, `tests/zippy-rate-limit.test.mjs` (update and extend), new `lib/zippy/client-ip.ts` (pure, no imports: `clientIpFromForwarded(header: string | null, hops: number): string | null`, `parseTrustedHops(raw: unknown): number` default 1, range 0 to 5), new `lib/zippy/body-cap.ts` (pure: `MAX_BODY_BYTES = 200_000`, `declaredLengthTooLarge(contentLength: string | null): boolean`), tests for both.
- `readLimits(env)` returns the limit set from env per the spec (integers 1 to 1,000,000, else the default; 0 or garbage gives the default). `rateLimitPlan` keeps its current shape for existing callers but takes the limits from `readLimits(process.env)` at call time and adds the new buckets: `preAuthPlan(ip)` (burst bucket `ipburst:<hash>:min`), and the per-identity plans extended with globals (`users:all:min/day` for signed-in callers; the existing `visitors:all:*` for visitors) and the overall ceiling `all:day` for everyone. Export a `Limit` type with a `kind` field (`"minute" | "day" | "global"`) so a result maps to a message class; export `retryAfterSeconds(windowSeconds, nowMs)` using the same fixed-window arithmetic as SQL (window start = `floor(epoch / w) * w`, seconds to the next boundary, minimum 1) and `limitMessage(kind, retryAfter)` returning the three messages from the spec (texts in `lib/zippy/constants.ts` next to RATE_LIMIT_MESSAGE; check whether the mobile app shows RATE_LIMIT_MESSAGE locally from `mobile/lib/zippy-constants.ts` and keep that consistent; mind the parity tests).
- Tests: defaults and env overrides, invalid env values, plan contents and ORDER for visitor, user and null IP, hashing (no raw IP), retry-after math at boundaries, message classes, proxy-hops extraction (hops 0 ignores the header; 1 rightmost; 2; missing or short header; spoofed leftmost; spaces; IPv6 `::1`), body cap.

## Task 2: Route integration

Files: `app/api/zippy/chat/route.ts`.
- 413 for a declared oversized body BEFORE parsing and a guard while reading (read the text with a cap; if over the cap return 413). Pre-auth burst check BEFORE `resolveCaller` using `clientIpFromForwarded(header, parseTrustedHops(process.env.ZIPPY_TRUSTED_PROXY_HOPS))`. After the caller is resolved run the identity plan (identity, global, ceiling). On a trip return 429 JSON `{ error: limitMessage(kind, retryAfter) }` with a `Retry-After` header, and one `console.warn("zippy: rate limit tripped", kind)` (class only). Replace the existing IP derivation with the new helper; keep fail-closed behaviour (a failing `zippy_hit` yields the same 502 as today). Keep everything else, including the streaming code paths.
- Update the stale comment about the trust model.

## Task 3: Docs

Files: `docs/DEPLOYMENT.md` (new "Public deployment checklist" section as in the spec's design item 9), README.md, CLAUDE.md (a rate-limit paragraph; fix the Z2 sentence listing the limits so it says they are env-tunable with these defaults), MEMORY.md entry, `.env.example` (commented placeholder lines for the new env vars, no secrets), knowledge if any FAQ mentions the limits (grep; facts must match the code; note a re-ingest if it changes). Manuals only if they state the limits (edit in place; use version bumps web v3.5.2 / mobile v4.6.2 to avoid clashing with other open PRs; PDFs; TOC only if pages change). Keep CRLF in the .md files.

## Task 4: Live verification (controller)

As in the spec's Testing section on a spare instance with tiny env limits; clean up the test `zippy_usage` rows.

## Task 5: Final review and PR

Final whole-branch review (most capable model), one fix wave, scoped re-review, push, PR. Merge only on Vishal's "you merge it".
