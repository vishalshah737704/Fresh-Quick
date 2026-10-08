# Deployment Guide — FoodHub

This project is **local/self-hosted only, by design** (see `CLAUDE.md` —
"No hosted Supabase, ever"). There is no cloud Supabase project and this
guide does not cover one. "Deploying" FoodHub means running it on a
machine you control — your own laptop, or a server/VM you administer —
with Docker running the database stack and Node running the web app.

## Prerequisites

- **Docker Desktop** — runs the self-hosted Supabase stack (Postgres,
  Auth, Storage, Realtime). Must be running before any `supabase` command.
- **Node.js** (the version this repo was built against — see the Next.js
  version in `package.json`; any current LTS Node works) and `npm`.
- **PowerShell 7+** if you want to use the `.ps1` script wrappers in
  `scripts/`. The underlying `npm run app:*` scripts work from any shell.
- Optional: a **Pexels API key** only if you intend to re-run the
  menu-image fetch (seed data already has image URLs baked in — see
  "External API keys" in `MEMORY.md`).

## 1. Get the code

```
git clone https://github.com/<owner>/Fresh-Quick.git
cd Fresh-Quick
npm install
```

## 2. Start the database

Start Docker Desktop first, then:

```
npx supabase start
```

This prints connection details (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
etc.) — keep this output visible, you need it for step 3. If Supabase was
already started in a previous session, `npx supabase status` reprints the
same values.

## 3. Configure environment variables

`.env.local` is gitignored and never committed — it does not exist in a
fresh checkout. Create it at the repo root:

```
NEXT_PUBLIC_SUPABASE_URL=<API_URL from step 2>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from step 2>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from step 2>
N8N_INTERNAL_SECRET=<any non-empty value, only needed if you touch /api/internal/*>
PEXELS_API_KEY=<optional, only needed to re-fetch menu images>
```

`.env.example` at the repo root lists the same keys as a template.

## 4. Load seed data

```
npm run app:seed
```

This runs `npx supabase db reset`, which drops and recreates the local
database, applies every migration in `supabase/migrations/`, and loads
`supabase/seed.sql` — cuisine taxonomy, a demo vendor/restaurant/menu, and
the seeded admin account (`admin@foodhub.local` / `admin-demo-password`).
Run this again any time you want to reset back to a clean seeded state
(e.g. after testing writes).

## 5. Build and start the app

**Production mode** (what you'd run on a real deployment target):

```
npm run app:build
npm run app:start
```

**Development mode** (hot-reload, for local iteration):

```
npm run app:start:dev
```

`app:start` and `app:start:dev` both check Supabase's status first and
start it automatically if it isn't already running (Docker Desktop still
has to be running for that to succeed).

The app serves on `http://localhost:3000` by default. Surfaces:
- Customer: `/customer`
- Vendor: `/vendor/login` (seed vendor credentials in
  `docs/superpowers/plans/2026-09-24-phase1-scaffold-db-schema.md`)
- Delivery: `/delivery/login`
- Admin: `/admin/login` (`admin@foodhub.local` / `admin-demo-password`)

## 6. Stop the app

```
npm run app:stop
```

Stops whatever is listening on port 3000 and stops the Supabase Docker
containers. To leave the database running and only stop the web server:

```
npm run app:stop -- --keep-supabase
```

## Script reference

All scripts live in `scripts/` as plain Node (`.mjs`, the canonical
cross-platform entry points) with thin PowerShell wrappers (`.ps1`) on top
for convenience on Windows (double-click or run directly without typing
`npm run`).

| Task | npm script | PowerShell wrapper |
|---|---|---|
| Build (production) | `npm run app:build` | `scripts/build.ps1` |
| Start (production) | `npm run app:start` | `scripts/start.ps1` |
| Start (dev/hot-reload) | `npm run app:start:dev` | `scripts/start.ps1 -Dev` |
| Stop | `npm run app:stop` | `scripts/stop.ps1` |
| Stop, keep DB running | `npm run app:stop -- --keep-supabase` | `scripts/stop.ps1 -KeepSupabase` |
| Seed database | `npm run app:seed` | `scripts/seed.ps1` |

`app:build` and `app:start` both refuse to run if `.env.local` is
missing, with a pointer back to step 3 above, rather than failing with
Next.js's less obvious `supabaseUrl is required` error.

## Updating a running deployment

```
git pull
npm install                 # only if dependencies changed
npm run app:seed            # only if new migrations were added — re-applies schema + seed data
npm run app:build
npm run app:stop
npm run app:start
```

**Note:** `app:seed` runs a full `db reset`, which wipes all data,
including anything created through the running app (orders, accounts,
etc.), not just seed data. There is no non-destructive migration-only
path yet — see the "No automated test suite" / migration tooling notes
in `MEMORY.md`. Only run it when you're prepared to lose current data, or
when you specifically want to return to a clean seeded state.

## Public deployment checklist

> **LOCAL ONLY (Vishal's decision, 2026-10-04).** Nothing in this checklist is needed today. It is kept for the day he decides to go public; going public requires every item here to be done first.

Read this before exposing the app (and so Ask Zippy) to the public internet. Every Zippy message costs
real money: an OpenAI embedding (plus one more per catalog search the model runs) and one to five Claude calls (up to 4 tool rounds and a final answer, up to 7 calls if `ZIPPY_MAX_TOOL_ROUNDS` is raised to 6).
The limits below bound the worst-case daily spend. All are env vars, read at call time, each an integer
from 1 to 1,000,000; anything else (0, text, empty) falls back to the default, so a typo can never switch
a limit off. Counts are per fixed window (a minute or a calendar day, UTC).

| Env var | Default | What it limits |
| --- | --- | --- |
| `ZIPPY_LIMIT_USER_PER_MIN` | 10 | one signed-in user, per minute |
| `ZIPPY_LIMIT_USER_PER_DAY` | 60 | one signed-in user, per day |
| `ZIPPY_LIMIT_VISITOR_PER_MIN` | 5 | one visitor IP, per minute |
| `ZIPPY_LIMIT_VISITOR_PER_DAY` | 20 | one visitor IP, per day |
| `ZIPPY_LIMIT_GLOBAL_VISITORS_PER_MIN` | 60 | all visitors together, per minute |
| `ZIPPY_LIMIT_GLOBAL_VISITORS_PER_DAY` | 1000 | all visitors together, per day |
| `ZIPPY_LIMIT_GLOBAL_USERS_PER_MIN` | 120 | all signed-in users together, per minute |
| `ZIPPY_LIMIT_GLOBAL_USERS_PER_DAY` | 5000 | all signed-in users together, per day |
| `ZIPPY_LIMIT_ALL_PER_DAY` | 8000 | overall ceiling, every caller, per day |
| `ZIPPY_LIMIT_IP_BURST_PER_MIN` | 40 | any request from one IP, per minute, checked before sign-in is verified |
| `ZIPPY_TRUSTED_PROXY_HOPS` | 1 | trusted proxies in front of the app (0 to 5) |

Order of checks: the IP burst bucket first (before the body is read or the token is verified, so a flood
of bad tokens costs no auth or database lookups), then the per-person buckets, then the global bucket for
that kind of caller, then the overall ceiling. The first bucket over its limit stops the request with HTTP
429 and a `Retry-After` header (seconds until that window resets). The message depends on the class: a
per-minute trip says to wait N seconds, a per-person daily trip says today's limit is reached, and a global
per-minute trip says Zippy is very busy and a global daily trip (or the overall ceiling) says Zippy has reached its limit for today. Request bodies over 200,000 bytes get 413 before parsing. Each trip writes one
server log line with the class only (no user id, IP or message text).

### Google Maps key

The web app's address picker, checkout address search and order tracking map use one Google Maps key, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. It is a browser key, so it is public by design: anyone can read it in the page source. Its protection is the restrictions set on it in the Google Cloud console, not secrecy.

- Restrict it by HTTP referrer. Today only `localhost:3000` to `localhost:3003` are listed (local use). Before any public launch, add the real domain to the referrer list.
- Restrict it by API to Maps JavaScript API, Places API (New) and Geocoding API only.
- Set daily quotas on those APIs and a budget alert in the Google Cloud console, so a leaked key cannot run up a large bill.
- Keep the key in `.env.local` only, never in a committed file. The mobile app does not use it.

### Sign-up geocoding key (`GOOGLE_MAPS_SERVER_API_KEY`)

Customer sign-up geocodes the registration address on the server with a second, separate key. It is a secret: keep it in `.env.local` only, never prefix it `NEXT_PUBLIC`, never ship it to the browser or phone app. Restrict it by API to Geocoding API only and set its Application restriction to None, because the Geocoding web service rejects referrer- and Android-restricted keys (REQUEST_DENIED); key changes take a few minutes to apply. Without it, sign-up returns 503 and creates no account. Before any public launch, set a daily quota and a budget alert on it, and consider throttling sign-up (each attempt costs one geocode call).

### Ratings and reviews

- Review and report routes have no rate limit (local-only install). Before going public add per-user and per-IP limits, a CAPTCHA or email-verified sign-up requirement before reviews, and image scanning for the `review-photos` bucket.

### Trusted proxy hops (`ZIPPY_TRUSTED_PROXY_HOPS`)

The client IP is taken from the `x-forwarded-for` header: it is the entry this many positions from the right,
because each trusted proxy appends the address it received the request from, so entries further left are
written by the client and cannot be trusted. Set it to the number of proxies you control in front of the app:

- `0`: no proxy (app exposed directly). The header is ignored, so the IP is always unknown and EVERY caller
  shares the pre-auth burst bucket `ipburst:unknown:min`, signed-in users included: one anonymous client
  sending 40 requests a minute locks everyone out of Zippy. Visitors also share a single 5 per minute and
  20 per day allowance in total. Always front a public deployment with a proxy (hops 1 or more); use 0 only
  for a private or test instance.
- `1` (default): one proxy, for example Caddy or nginx on the same host, or a single platform proxy.
- `2`: two proxies, for example a CDN in front of a load balancer.

A wrong value breaks things in one of two ways. Too low (say 1 behind a CDN plus a proxy): the "client" is
actually a proxy address, so all visitors share one bucket and the first heavy user locks everyone out.
Too high, or 1 with no proxy at all: the chosen entry is client-controlled (Next fills `x-forwarded-for`
with the socket address only when the header is absent, so a client-supplied value is kept), so an attacker
can send a different fake address on every request and get a fresh visitor bucket each time. Locally, with
no header sent, the IP is `::1` or `127.0.0.1`, not unknown. Verify after deploying:
send the same request twice with a made-up leftmost `x-forwarded-for` entry and confirm the count still
accumulates against your own address.

### Cost ceiling arithmetic

Worst-case spend per day is `ZIPPY_LIMIT_ALL_PER_DAY` times the model calls one message can make: 1
embedding for the question, up to 4 tool rounds (up to 6 if `ZIPPY_MAX_TOOL_ROUNDS` is raised) and 1 final
answer, so up to 5 Claude calls (7 at 6 rounds). Each tool round can run up to 6 tool calls and each
`search_catalog` call embeds again, so up to about 25 embeddings per message (1 + 6 x 4). At the default
ceiling of 8000 that is up to 40,000 Claude calls (56,000 at 6 rounds) and about 200,000 embeddings a day. Price that
with your current model rates (long conversations and tool results make the Claude calls larger than a
typical question) and lower the ceiling, or `ZIPPY_MAX_TOOL_ROUNDS`, until the number is one you accept.
At the defaults 1000 (visitors) + 5000 (signed-in) is less than 8000, so the overall ceiling only bites once
you raise the global buckets; until then the per-class buckets are the real limit, and a flood of visitors
cannot use up the signed-in users' share.

### Not covered by these limits

- Public sign-up is not throttled and has no CAPTCHA, so an attacker can create many accounts. The global
  signed-in buckets and the overall ceiling bound the spend, but one attacker can still use up the daily
  budget and make Zippy say it is busy for everyone.
- There is no per-user cap on concurrent requests (the limits count requests, not how many run at once).
- Provider-side spend limits: set a monthly budget and alerts in the Anthropic console and the OpenAI
  console. They are the last line of defense if the limits above are set too high or a key leaks.

### Testing the limits safely

Do it on a spare local instance, never on production. Start it with tiny env limits (for example
`ZIPPY_LIMIT_VISITOR_PER_MIN=2`, `ZIPPY_LIMIT_VISITOR_PER_DAY=3`, `ZIPPY_LIMIT_IP_BURST_PER_MIN=8`) and send
visitor requests to `POST /api/zippy/chat`: calls 1 and 2 return 200, call 3 returns 429 with `Retry-After`
and no model call is made (only the passing requests spend anything). Use a different `x-forwarded-for` address
to confirm a different client gets its own bucket. The counters live in the `zippy_usage` table under real
bucket names, so delete the rows for your test IP hash afterwards.

## Things this guide deliberately does not cover

- **Hosted/cloud Supabase** — explicitly out of scope; this project's
  standing rule is self-hosted-only (`CLAUDE.md`).
- **Vercel or other Next.js hosting platforms** — not covered here. If
  you want to deploy the Next.js frontend separately from this Docker
  stack in the future, it would need a self-hosted Supabase instance
  reachable over the network (not `127.0.0.1`), which is a further
  architectural step beyond what's set up today.
- **HTTPS/reverse proxy/domain setup** — this guide covers running the
  app; putting it behind a real domain with TLS is standard reverse-proxy
  work (nginx/Caddy/Traefik in front of `next start`) not specific to
  this project.
- **n8n automation** — the `/api/internal/*` routes and
  `n8n/workflows/*.json` are explicitly untested reference material (see
  `docs/n8n-webhook-setup.md` and MEMORY.md's Phase 7 entry). Wiring up a
  real n8n instance is a separate task, not part of deploying the web app.
