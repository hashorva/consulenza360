---
spec: AGENTS.md v1.0 (skeleton-aligned, Jul 2026)
tools: Codex (execution), Claude Code (backend/architecture), Cursor (parallel implementation)
---

# Consulenza360 ISIN Monitor — Agent Instructions

## Product

A single Cloudflare Workers Static Assets app for monitoring whether imported bond
ISINs are present on Borsa Italiana EuroTLX. Daily scheduled checks run through a
serialized Cloudflare Queue; results are stored in Supabase; a compact dashboard
shows presence status, history, and live run logs.

## Stack

- Frontend: React (latest) + Vite + Tailwind CSS v4 + shadcn/ui (Luma style) + Recharts + TanStack Table + Hugeicons free icons; stone light/dark theme, cyan chart accents
- Backend: unified Cloudflare Worker (`src/index.ts`) — API routes, scheduled handler, and queue consumer in one entry point
- Database: Supabase PostgreSQL — migrations + RPCs in `supabase/migrations/`
- Access control: Cloudflare Access in production (`CF-Access-JWT-Assertion`)
- Deploy: starts on `workers.dev`; custom subdomain can be added later

## Deployment discipline

- GitHub is the source of truth for code and migration files.
- Production migrations deploy via the **Supabase GitHub integration from `main`** —
  see Database rules. Treat every push to `main` as a production change.
- Required production secrets must be set in Cloudflare before deploy:
  `CONSULENZA360_SUPABASE_URL`, `CONSULENZA360_SUPABASE_SERVICE_ROLE_KEY`,
  `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`.

## Commands

| Task | Command |
| --- | --- |
| Dev (Worker-backed, Wrangler) | `npm run dev` |
| Dev (Vite frontend-only) | `npm run dev:ui` |
| Build | `npm run build` |
| Tests | `npm run test` |
| Import dry-run | `npm run import:isins -- --dry-run` |
| Import | `npm run import:isins` |
| Deploy | `npm run deploy` |
| Tail logs | `npm run tail` |

`npm run import:isins -- --dry-run` should parse 551 rows from
`500 ISINs obbligazionari.xlsx`.

## Security invariants — never violate

- Never expose the Supabase service role key to React/Vite client code.
- The Worker must instantiate Supabase clients only inside handler execution paths
  using `env.CONSULENZA360_SUPABASE_URL` and
  `env.CONSULENZA360_SUPABASE_SERVICE_ROLE_KEY`. Never at module top level.
- HTTP/API routes must validate Cloudflare Access in production via
  `CF-Access-JWT-Assertion`. Scheduled and queue handlers are native Worker handlers
  and do not go through HTTP middleware. Localhost may bypass Cloudflare Access only
  for local development when Access env vars are absent.
- Enable RLS on exposed tables. In v1, browser access goes through the Worker API only.
- Never commit: `.env`, `.env.local`, `.dev.vars`, `supabase/.temp/`, Supabase secret
  keys, Cloudflare API tokens, database passwords.

## Database rules

- Schema changes follow `.agents/skills/supabase-migration/SKILL.md`.
- **Apply path for this project: GitHub integration.** Create the migration with
  `supabase migration new <name>`, edit the generated SQL, commit, push to `main`,
  and let the Supabase GitHub integration deploy it. Do NOT run `supabase db push`
  for production unless the user explicitly asks for a manual push.
- Do not apply production database changes directly unless the user explicitly asks.
- Do not modify the remote database manually from the Supabase dashboard except for
  emergency inspection/debugging.
- The database is the source of truth after the initial Excel import.
- Schema, tables, and required RPCs → `docs/ARCHITECTURE.md`.

## Frontend rules

- For UI work → consult `docs/DESIGN.md` and `.agents/skills/shadcn-luma/SKILL.md`
  before changing components or adding styles. Installing default/new-york shadcn
  components is a failed task.
- Preserve this dashboard's operational density: compact ISIN rows (44–52px),
  scan-friendly tables. Density takes priority over Luma airiness (details in
  `docs/DESIGN.md`).
- Avoid arbitrary Tailwind values such as `mb-[60px]` when a close scale utility
  exists. If the user gives a pixel value, choose the nearest Tailwind token
  (e.g. `mb-14` or `mb-16`), not a bracketed custom value.

## Repo boundary

Single repo. Core structure:

- `src/app/` — React/Vite frontend
- `src/index.ts` — unified Worker entry point (API routes, scheduled handler, queue consumer)
- `src/worker/` — Worker-only backend modules
- `supabase/migrations/` — database schema and RPC migrations
- `scripts/import-isins.ts` — idempotent Excel import script
- `wrangler.jsonc` — Worker, assets, cron, and queue configuration
- `.agents/skills/` — canonical agent skills (symlinked into per-tool paths)
- `docs/` — ARCHITECTURE.md, DOMAIN.md, DESIGN.md, ORCHESTRATION.md, templates/

## Skills (procedures — read before improvising)

Reusable procedures live in `.agents/skills/` (canonical source of truth). Tool
discovery paths (`.claude/skills`, `.cursor/skills`, `.gemini/skills`) are
whole-directory symlinks to it — edit skills ONLY in `.agents/skills/`. If a task
matches a skill (migrations, shadcn/Luma UI, MCP usage), read that SKILL.md and follow
it. Re-deriving a procedure a skill already covers is a failed task.

## Workflow

- Inspect existing file structure before editing — audit before assuming.
- Prefer small, reviewable diffs — one concern per commit.
- Do not introduce new production dependencies without explaining the reason.
- Do not edit `AGENTS.md` or any file under `docs/` unless the task is explicitly
  about project instructions or agent rules.
- Before considering backend/frontend changes complete, run:
  `npm run test`, `npm run build`, `npm audit --omit=dev`,
  `npx wrangler deploy --dry-run`. Expected: Vitest parser/pool tests pass,
  build/typecheck passes, production audit has zero vulnerabilities, Wrangler dry-run
  validates Worker, assets, and queue bindings.
- Wrangler may attempt to write local logs under the user home directory; sandboxed
  Codex sessions can block that without invalidating the dry-run if Wrangler still
  exits successfully.
- When stuck or if planning exceeds 3 iterations without a clear path → STOP, output
  your current hypothesis, and request human intervention. Never guess on schema,
  security, or the queue architecture.

## Orchestrated missions (GOAL/features loop — active only when the files exist)

Some work runs as an orchestrator/worker loop. Full protocol: `docs/ORCHESTRATION.md`.
A mission is **active** when `GOAL.md` and `features.json` exist at the repo root.
When active, these rules apply on top of everything above:

- **Session start (bearings):** read `PROGRESS.md` (last 3 entries), `features.json`,
  and `git log --oneline -10` before editing anything. Verify baseline
  (`npm run build`) before implementing; if the repo is broken, fix/report that first.
- **One feature per session.** Pick the assigned (or highest-priority) `passes: false`
  feature. Never start a second one in the same session.
- **`features.json` is append-only truth.** Agents may only flip `"passes": false → true`
  after verifying every step end-to-end. Editing or removing descriptions/steps is a
  failed task. `GOAL.md` is narrative; if they disagree, `features.json` wins.
- **Session end (clean state):** verification commands green, committed with a
  descriptive message, one entry appended to `PROGRESS.md`.
- **WORKER_TASK files are binding.** If you received one, it is your entire scope; its
  file allow/deny lists override any broader interpretation of the goal. Respect its
  iteration policy, then STOP and report — never keep grinding.

## Domain guardrail (always applies)

If Borsa blocks Cloudflare Worker traffic, mark the run `blocked`; do NOT silently
downgrade parser quality or add fake successful results. The next architectural
decision would be switching runner or adding a real proxy integration — that is a
human decision, never an agent improvisation. Matching rules: `docs/DOMAIN.md`.
