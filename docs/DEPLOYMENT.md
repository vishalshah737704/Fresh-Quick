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
