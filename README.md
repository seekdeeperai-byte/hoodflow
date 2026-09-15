# HOODFLOW

**Know Before You Flow.** Token intelligence and market-context platform,
starting with the Robinhood ecosystem / Robinhood Chain.

This is not a scanner or a dashboard — it turns contract, liquidity,
holder, and (later) social/news data into evidence-backed interpretations
of what's actually happening with a token, with explicit confidence and
explicit limitations. See `docs/` for the full picture; start with
`docs/ARCHITECTURE.md`.

## Status

Through Phase 10: research, monorepo foundation, provider layer (GoPlus /
DexScreener / Blockscout), the core intelligence pipeline (analyzers →
signals → relationships → evidence → interpretation → market state),
identity resolution (Phase 5), historical intelligence + temporal
relationships (Phase 6), a Next.js frontend (Phase 8, QA'd in a real
browser in Phase 8.1), a live-data provider audit (Phase 9), and a
production-network verification attempt (Phase 10) that re-confirmed this
sandbox still cannot reach any provider via the repo's own client code
(same policy-level egress block since Phase 0) and re-proved the full
report pipeline end-to-end with zero fabricated data. No social/news/hype
provider, no deployer/wallet intelligence, no RPC client, no persistence
beyond in-memory history yet. See `docs/ROADMAP.md` for what's next and
why.

## Layout

```
apps/api             Fastify API — GET /v1/report/:chainId/:address, GET /healthz
apps/web              Next.js frontend — presentation layer over HoodflowReport (see docs/FRONTEND.md)
packages/core         Pure, dependency-free intelligence engine (no I/O)
packages/providers     GoPlus / DexScreener / Blockscout clients + zod validation
docs/                  Architecture, data sources, scoring, security, roadmap
```

## Running it

```bash
pnpm install
pnpm -r run build
pnpm test              # 194 tests, all fixture-backed (see docs/ARCHITECTURE.md §2)
cp apps/api/.env.example apps/api/.env   # optional: GOPLUS_API_KEY / BLOCKSCOUT_API_KEY
pnpm --filter @hoodflow/api run start    # after build, or `run dev` for tsx watch mode
curl http://localhost:8787/healthz
curl http://localhost:8787/v1/report/4663/0xYOUR_TOKEN_ADDRESS

# frontend (in a second terminal, with the API above already running on :8787)
pnpm --filter @hoodflow/web run dev      # http://localhost:3000
```

**Important:** this was built and tested inside a sandbox whose outbound
network access is policy-restricted to package registries only — the
provider clients' own HTTP calls (Node `fetch`, and plain `curl`) still
cannot reach GoPlus/DexScreener/Blockscout from here (see
`docs/ARCHITECTURE.md` §2), re-confirmed as recently as Phase 10
(2026-09-15) with fresh proxy-log evidence. All 194 tests run against
realistic fixtures, not live traffic. GoPlus and DexScreener's real API
*shape* has been confirmed via a separate, policy-trusted fetch path
available only to this session (not the repo's own client code, and not
sufficient proof on its own — Phase 10 found a real numeric discrepancy
between two supposedly-live captures of the same field, most likely from
that path's own response summarization, not the provider). Blockscout
remains fully blocked, including via that trusted path (a WAF/bot-
protection 403, distinct from the sandbox's own egress block). See
`docs/LIVE_VERIFICATION.md` for the full picture and
`scripts/verify-live-providers.ts` for the reproducible way to close this
gap from an environment with normal outbound network access.

## Data integrity, in one sentence

Every external call resolves to an explicit `DataState`
(`AVAILABLE | PARTIAL | DATA_UNAVAILABLE | PROVIDER_UNAVAILABLE |
INVALID_INPUT | RATE_LIMITED | ERROR`); nothing downstream is allowed to
treat "missing" as "zero," "false," or "safe" — see `docs/ARCHITECTURE.md` §5.
