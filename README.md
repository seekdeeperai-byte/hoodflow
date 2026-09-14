# HOODFLOW

**Know Before You Flow.** Token intelligence and market-context platform,
starting with the Robinhood ecosystem / Robinhood Chain.

This is not a scanner or a dashboard — it turns contract, liquidity,
holder, and (later) social/news data into evidence-backed interpretations
of what's actually happening with a token, with explicit confidence and
explicit limitations. See `docs/` for the full picture; start with
`docs/ARCHITECTURE.md`.

## Status

Phase 0–3 vertical slice: research, monorepo foundation, provider layer
(GoPlus / DexScreener / Blockscout), and the core intelligence pipeline
(analyzers → signals → relationships → evidence → interpretation → market
state), exposed over one API route. No frontend, no social/news, no
persistence yet. See `docs/ROADMAP.md` for what's next and why.

## Layout

```
apps/api            Fastify API — GET /v1/report/:chainId/:address, GET /healthz
packages/core        Pure, dependency-free intelligence engine (no I/O)
packages/providers    GoPlus / DexScreener / Blockscout clients + zod validation
docs/                 Architecture, data sources, scoring, security, roadmap
```

## Running it

```bash
pnpm install
pnpm -r run build
pnpm test              # 44 tests, all fixture-backed (see docs/ARCHITECTURE.md §2)
cp apps/api/.env.example apps/api/.env   # optional: GOPLUS_API_KEY / BLOCKSCOUT_API_KEY
pnpm --filter @hoodflow/api run start    # after build, or `run dev` for tsx watch mode
curl http://localhost:8787/healthz
curl http://localhost:8787/v1/report/4663/0xYOUR_TOKEN_ADDRESS
```

**Important:** this was built and tested inside a sandbox whose outbound
network access is policy-restricted to package registries only (no live
calls to GoPlus/DexScreener/Blockscout were possible from here — see
`docs/ARCHITECTURE.md` §2). All 44 tests run against realistic fixtures.
The first time this runs somewhere with normal internet access, treat the
live provider responses as unverified until you've confirmed they match
what the zod schemas in `packages/providers/src/*/schema.ts` expect —
especially GoPlus's chain-4663 support and DexScreener's Robinhood Chain
slug, both flagged unverified in `docs/DATA_SOURCES.md`.

## Data integrity, in one sentence

Every external call resolves to an explicit `DataState`
(`AVAILABLE | PARTIAL | DATA_UNAVAILABLE | PROVIDER_UNAVAILABLE |
INVALID_INPUT | RATE_LIMITED | ERROR`); nothing downstream is allowed to
treat "missing" as "zero," "false," or "safe" — see `docs/ARCHITECTURE.md` §5.
