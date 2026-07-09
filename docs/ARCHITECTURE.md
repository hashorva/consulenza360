---
name: Consulenza360 — Architecture
loaded: on demand (backend, queue, data model, deployment tasks)
---

# Architecture

## Worker execution model

- Single Worker (`src/index.ts`): API routes, scheduled handler, queue consumer.
- Supabase clients are created only inside handler execution paths using
  `env.CONSULENZA360_SUPABASE_URL` + `env.CONSULENZA360_SUPABASE_SERVICE_ROLE_KEY` —
  never at module top level.
- HTTP/API routes validate Cloudflare Access in production (`CF-Access-JWT-Assertion`).
  Scheduled and queue handlers are native Worker handlers — no HTTP middleware.
  Localhost may bypass Access only when Access env vars are absent.

## Queue execution model (serialized baton-pass, Free plan)

- Cron is `0 * * * 1-5`.
- Cron calls `maybe_start_due_run(now_utc)`.
- Supabase decides whether the configured Europe/Rome whole-hour run is due.
- When due, enqueue exactly one message: `{ run_id, iteration: 1 }`.
- Queue consumer claims up to 45 pending ISINs.
- Borsa fetch concurrency is capped at 4.
- Results are bulk-completed through one Supabase RPC.
- The consumer enqueues the next single message only if more work remains.
- Keep `max_batch_size: 1`, `max_batch_timeout: 1`, `max_concurrency: 1`, retries,
  and a DLQ in `wrangler.jsonc`.

Target subrequest budget per chunk is 47 external requests:
45 Borsa fetches + 1 Supabase claim RPC + 1 Supabase complete RPC.

## Supabase data model

The database is the source of truth after the initial Excel import.

Main tables:

- `isins`: active source-of-truth instrument list.
- `check_runs`: run status, trigger type, scheduled date, counters, timestamps.
- `check_run_items`: per-run queue item state.
- `isin_checks`: historical result per `run_id + isin`.
- `settings`: enabled flag, timezone, whole-hour run time, weekday-only flag.

Required RPCs:

- `maybe_start_due_run(now_utc)`
- `claim_check_chunk(run_id, chunk_size)`
- `complete_check_chunk(run_id, results)`
- `mark_run_blocked(run_id, reason, metadata)`

RLS enabled on exposed tables; browser access goes through the Worker API only (v1).

## Live log endpoint

`GET /api/runs/:run_id/logs` — frontend polls every 4 seconds while a run is active
and stops when the run is completed, failed, or blocked.

## Deployment assumptions

- Deployment starts on `workers.dev`; a custom subdomain can be added later.
- Cloudflare Access protects the deployed app.
- Production secrets set in Cloudflare before deploy:
  `CONSULENZA360_SUPABASE_URL`, `CONSULENZA360_SUPABASE_SERVICE_ROLE_KEY`,
  `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`.
