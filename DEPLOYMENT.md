# Deployment

This describes the Vercel deployment of HOODFLOW: two projects from one
repository, plus a managed PostgreSQL database for durable history.

It documents what the committed configuration actually does. Where something
is a deliberate trade-off or a known limitation, it says so rather than
leaving it to be discovered in production.

## Shape

```
  browser
     │  same-origin /api/v1/* only
     ▼
  hoodflow-web   (Vercel, Next.js, root dir apps/web)
     │  server-to-server rewrite (next.config.mjs)
     ▼
  hoodflow-api   (Vercel Function, Fastify, root dir apps/api)
     │
     ├── GoPlus · DexScreener · Blockscout · GDELT · X
     └── PostgreSQL (history)
```

The browser never learns the API's address and never calls it directly. That
is not an accident of the deployment — it is the reason `apps/web` uses a
relative `/api/v1/...` path and a `rewrites()` entry instead of a public API
base URL, so there is no CORS surface and no third-party origin in the CSP
(see the header comment in `apps/web/next.config.mjs`).

## Current state

Both Vercel projects exist, are configured, and are linked to
`seekdeeperai-byte/hoodflow` on `master` (account `hakankayaitu-3921`,
`team_E6VvsIiz8qDzZhTyieFyqIYd`):

| Project | ID | Root Directory | Production origin |
| --- | --- | --- | --- |
| `hoodflow-api` | `prj_cxjeG1bWUBVAEK66VUKifKydEuok` | `apps/api` | `https://hoodflow-api-hakankayaitu-3921.vercel.app` |
| `hoodflow-web` | `prj_aNIRaJMS8ZDfeVw71LuCd9gKs837` | `apps/web` | `https://hoodflow-web-hakankayaitu-3921.vercel.app` |

Both are on Node 22.x, have `sourceFilesOutsideRootDirectory` enabled (the
build needs the workspace root), and have Vercel Authentication scoped to
preview only — production must be publicly reachable, or the web project's
server-side rewrite cannot reach the API.

The git link is proven, not assumed: a production deployment of `master`
(`dpl_7Tj34GT84fpViP83Ud9CLEEFv7Y5`) fetched commit `057a7fe` from GitHub
and reached the build step. It then failed, exactly as that commit should:
`module_not_found`, `Command "pnpm run build" exited with 2`. At `057a7fe`
there is no `apps/api/vercel.json`, so Vercel ran the package's own build
script without building `@hoodflow/core` and `@hoodflow/providers` first,
and `tsc` could not resolve them. That is the gap `vercel.json` closes.

**One thing is still required, and it cannot be done from inside this
session: the current commit has to reach GitHub.** `master` there is at
`057a7fe`; everything in this document lives in later commits, and pushing
from this session is refused by the git proxy —
`seekdeeperai-byte/hoodflow is not in this session's authorized repository
set`. Once it is pushed, both projects deploy on their own.

Two leftovers, `zz-hoodflow-api-unlinked` and `zz-hoodflow-web-unlinked`,
are earlier unlinked projects that have never deployed. They can be deleted
from the dashboard (the API exposes no project-delete). Deleting them also
frees `hoodflow-api.vercel.app` and `hoodflow-web.vercel.app`, which they
still hold; the origins in the table above work either way.

`DATABASE_URL` is deliberately not set by automation: it carries the
database password, so it is entered in the Vercel dashboard directly.

## Project: `hoodflow-api`

| Setting | Value |
| --- | --- |
| Root Directory | `apps/api` |
| Framework Preset | Other |
| Install / Build | from `apps/api/vercel.json` |

`apps/api/vercel.json` builds the two workspace packages and the API, in
topological order, from the repository root — `apps/api` alone is not
buildable, because `@hoodflow/core` and `@hoodflow/providers` are consumed as
their compiled `dist/` output.

### How Fastify runs as a function

`apps/api/api/index.ts` is the file Vercel treats as the function. It is one
line: it re-exports `dist/vercel-handler.js`. All of the adapter logic is in
`apps/api/src/vercel-handler.ts`, which the package's own `tsconfig.json`
type-checks and compiles.

The adapter memoizes one Fastify instance per warm instance, `await`s
`app.ready()` (nothing else triggers plugin boot when you never call
`listen()`), and then emits `"request"` on Fastify's underlying
`http.Server`. Every hook, the rate limiter, the router, the 404 handler and
the error handler run exactly as they do under `pnpm start` — the deployed
behaviour cannot drift from what the test suite exercises, because it is the
same app object.

A `rewrites` rule sends every path to that function. The one exception is
`/`, which serves `apps/api/public/index.html`: Vercel's filesystem check
runs before rewrites, and that directory also satisfies the build's
`outputDirectory` requirement.

`apps/api/test/deployment-config.test.ts` asserts the parts of this that are
otherwise only discoverable by deploying: that the shim still points at a
real export, that it has not grown logic of its own, and that the declared
output directory exists.

### Environment variables

| Variable | Value | Why |
| --- | --- | --- |
| `DATABASE_URL` | pooler connection string | durable history; see below |
| `PG_POOL_MAX` | `1` | one pool per instance, many instances |
| `TRUST_PROXY` | `true` | per-client rate limiting |
| `LOG_LEVEL` | `info` | |
| `BLOCKSCOUT_API_KEY` | optional | raises the Blockscout rate limit |
| `GOPLUS_API_KEY` | optional | raises the GoPlus rate limit |
| `X_BEARER_TOKEN` | optional | Social Intelligence; no free tier exists |

`PORT` and `HOST` are unused on Vercel (nothing calls `listen()`), and are
left at their defaults.

**`TRUST_PROXY=true` is only correct here because Vercel overwrites
`X-Forwarded-For`** and does not forward externally-supplied values
([docs](https://vercel.com/docs/headers/request-headers)). Behind a proxy that
does not make that guarantee, `true` would let any client forge a fresh
rate-limit bucket per request. Left `false` behind *any* proxy, the opposite
failure occurs and is guaranteed rather than theoretical: every request looks
like it came from the proxy, so all users share one bucket and one busy client
returns 429 to everybody else. This is why the flag is explicit configuration
with a fail-closed default instead of a vendor sniff.

### Database

Point `DATABASE_URL` at the provider's **pooler** endpoint, not its direct
connection (on Supabase: the "Transaction pooler" URI, port 6543 — not 5432).
A serverless platform runs many instances concurrently and each builds its own
`pg.Pool`; against a direct connection that exhausts the database's connection
limit under ordinary traffic. `PG_POOL_MAX=1` is the matching half of that.

The schema is created idempotently on first use, so there is no separate
migration step. `apps/api/migrations/001_init.sql` stays the human-facing
source of truth and `apps/api/test/postgres-history-store.test.ts` fails the
build if the inlined DDL drifts from it.

**Without `DATABASE_URL` the API still runs, but on serverless it cannot
accumulate history at all.** `InMemoryHistoryStore` is not merely "lost on
restart" there: each invocation can be a fresh instance, so the store is
effectively always empty, every scan reports `INSUFFICIENT_HISTORY`, "what
changed" never has a prior observation to compare against, and the Ecosystem
Pulse has nothing to aggregate. The app reports this honestly rather than
pretending, but the product is a live snapshot viewer until a database is
configured.

## Project: `hoodflow-web`

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` |
| Framework Preset | Next.js |
| Install / Build | from `apps/web/vercel.json` |

| Variable | Value | Why |
| --- | --- | --- |
| `HOODFLOW_API_BASE_URL` | the API project's production origin | server-side rewrite target |
| `HOODFLOW_SITE_URL` | this project's public origin, no trailing slash | canonicals, OG, sitemap |
| `HOODFLOW_NOINDEX` | `true` on any non-production environment | keeps staging out of the index |

`HOODFLOW_SITE_URL` is required in production. Unset, the app runs normally
but serves `noindex` and a `robots.txt` that disallows everything — deliberate,
because without knowing its own origin it cannot emit a truthful canonical, and
a wrong canonical is worse than no indexing. If production is unexpectedly not
indexed, check this variable first (`apps/web/lib/site.ts`).

`HOODFLOW_API_BASE_URL` is read at build time by `next.config.mjs`, so
**changing it requires a redeploy**, not just an environment-variable edit.

## Verifying a deployment

In order, against the real deployed origins:

1. `GET <api>/liveness` → `{"status":"alive"}`.
2. `GET <api>/readiness` → `ready: true`, and `history` must read `postgres`.
   If it reads `in_memory`, `DATABASE_URL` did not reach the function.
3. `GET <api>/v1/report/4663/<a real token address>` → 200. Check each section's
   `state`: `PROVIDER_UNAVAILABLE` means the provider was unreachable from the
   function, which is a deployment finding, not a data finding.
4. `GET <api>/v1/pulse/4663` → 200.
5. Load `<web>/` and a report page; confirm the browser's network panel shows
   only same-origin `/api/v1/...` requests.
6. Scan the same token twice, a minute apart, then reload the report. The
   second scan must show "what changed" rather than `INSUFFICIENT_HISTORY` —
   this is the only check that proves durable history is actually working
   end-to-end.

Step 6 is the one that catches a misconfigured database, because steps 1–4 all
pass against an in-memory store.

## Limitations

- **Cold starts.** The first request to a cold instance pays Fastify
  construction plus schema bootstrap. Health probes are exempt from rate
  limiting but not from cold start.
- **One database schema for all environments.** Preview deployments share
  whatever `DATABASE_URL` they are given. Give preview its own database if
  preview traffic must not pollute production history.
- **`maxDuration` is 30s.** A report fans out to several providers; a slow
  provider can push a cold request near that bound.
