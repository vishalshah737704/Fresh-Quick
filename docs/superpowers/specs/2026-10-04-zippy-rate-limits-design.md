# Ask Zippy: rate limits and abuse guards for a public deployment

Date: 2026-10-04. Approved to run autonomously by Vishal ("make your judgement"); decisions below were taken by the controller.

## Intent

Every Zippy message costs real money (OpenAI embedding plus one to five Claude calls). Today's limits (signed-in 10/min and 60/day per user; visitors 5/min and 20/day per IP plus a global visitor backstop of 60/min and 1000/day) are fine on a private laptop but have gaps before the app is exposed publicly. Success: the worst-case daily spend is bounded no matter how many accounts or IPs an attacker uses, the limits are tunable per deployment without code changes, the proxy/IP trust assumption is explicit, oversized or abusive requests are rejected before they cost anything, and users get a clear, honest "try again in N seconds" message.

## Gaps found in the audit (current code: `lib/zippy/rate-limit.ts`, `app/api/zippy/chat/route.ts`, `lib/zippy/caller.ts`)

1. **Signed-in users have no global backstop.** Sign-up is public, so N new accounts get N x 60 messages a day: unbounded spend.
2. **No ceiling across all callers.** Only visitors have a global bucket.
3. **Limits are constants in code.** A deployment cannot tune them (and tests of the live 429 path would need real traffic).
4. **Nothing runs before authentication.** `resolveCaller` calls Supabase Auth and the users table for every request, so a flood of bad or valid tokens costs database work before any limit applies.
5. **IP trust is hard-wired:** the rightmost `x-forwarded-for` entry is used, which is only correct with exactly one trusted proxy in front. Behind a CDN plus a platform proxy it identifies the proxy, not the client (everyone shares one bucket), and with no proxy it is client-controlled.
6. **No request body size cap:** `request.json()` reads an unbounded body before validation.
7. **429 gives no `Retry-After` and one generic message** whether the user hit the per-minute cap, the daily cap or a global cap.
8. **No signal when limits trip** (no log line to spot abuse).

## Design

1. **Configurable limits** (env, validated integers within sane bounds, else the default; read at call time): `ZIPPY_LIMIT_USER_PER_MIN` (10), `ZIPPY_LIMIT_USER_PER_DAY` (60), `ZIPPY_LIMIT_VISITOR_PER_MIN` (5), `ZIPPY_LIMIT_VISITOR_PER_DAY` (20), `ZIPPY_LIMIT_GLOBAL_VISITORS_PER_MIN` (60), `ZIPPY_LIMIT_GLOBAL_VISITORS_PER_DAY` (1000), new `ZIPPY_LIMIT_GLOBAL_USERS_PER_MIN` (120), new `ZIPPY_LIMIT_GLOBAL_USERS_PER_DAY` (5000), new overall ceiling `ZIPPY_LIMIT_ALL_PER_DAY` (8000, every caller), new `ZIPPY_LIMIT_IP_BURST_PER_MIN` (40, pre-auth, every caller). A value of 0 or garbage falls back to the default (a limit can never be switched off by a typo).
2. **Pre-auth IP burst bucket** checked before `resolveCaller` (one `zippy_hit` call, hashed IP): protects the auth and database lookups.
3. **Plan order:** burst (pre-auth), then after the caller is known the existing per-identity buckets, then the global buckets, then the overall daily ceiling. The first bucket over its limit stops the request. The result says which bucket class tripped and the seconds until that window resets.
4. **Trusted proxies:** `ZIPPY_TRUSTED_PROXY_HOPS` (default 1, range 0 to 5). The client IP is the entry `hops` positions from the right of `x-forwarded-for`; with 0 hops (no proxy) `x-forwarded-for` is ignored and the IP is treated as unknown (one shared strict visitor bucket, as today when no header exists). A missing or short header gives unknown. Documented in the deployment guide with examples.
5. **Body cap:** requests with `content-length` over 200 000 bytes (or whose body exceeds it while reading) get 413 before JSON parsing. 200 KB covers the largest legitimate body (history up to 40 000 characters plus a 50-line cart snapshot).
6. **429 details:** `Retry-After` header (seconds until the tripped window resets, at least 1) and a message by class: per-person "You're asking a little too fast. Please wait N seconds and try again." (minute), "You've reached today's Zippy limit. Please try again tomorrow." (a person's or IP's day bucket), and "Zippy is very busy right now. Please try again in a few minutes." (global buckets and the ceiling). Clients already show the `error` text from the JSON body, so no client change.
7. **Abuse signal:** one `console.warn` line per trip with the bucket class only (no user id, no raw IP, no content).
8. **No migration:** `zippy_hit` and `zippy_usage` are reused; stale-row cleanup already exists (and the retention purge also clears them).
9. **Deployment guide:** a "Public deployment checklist" section in `docs/DEPLOYMENT.md` listing the limits, the proxy-hops setting, the cost-ceiling arithmetic (overall daily ceiling times worst-case calls per message), and what is still not covered (public sign-up throttling and CAPTCHA, per-user concurrency caps, provider-side spend limits: set a monthly budget in the Anthropic and OpenAI consoles).

## Out of scope

Throttling sign-up, CAPTCHA, a distributed concurrency limiter, changing the default per-user limits, Redis.

## Testing

Unit tests (node): limits parsing from a fake env, the plans with the new buckets and their order, the retry-after arithmetic, the message class mapping, the proxy-hops IP extraction (hops 0/1/2, short or missing header, spoofed leftmost entry ignored, whitespace, IPv6), the body cap helper. Live on a spare instance with tiny env limits (for example visitor 2/min, burst 6): visitor calls get 200 then 429 with `Retry-After` and the minute message before any model call is made (check timing and that no assistant row is saved), the daily class via a tiny daily limit, the global class, a 413 for an oversized body, a bad-token flood hits the burst limit before auth, and `x-forwarded-for` spoofing with hops=1 does not give a fresh bucket. Test rows in `zippy_usage` use the real buckets: clean them up afterwards (buckets with the test IP hash); spend only on the few requests that pass.
