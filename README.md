# HOODFLOW

**Know Before You Flow.** Token intelligence and market-context platform,
starting with the Robinhood ecosystem / Robinhood Chain.

This is not a scanner, a dashboard, or a chatbot — it turns contract,
liquidity, holder, historical, social, news, and attention data into
evidence-backed interpretations of what's actually happening with a token,
including how those sources relate to (and sometimes contradict) each
other, with explicit confidence and explicit limitations, and never a
trade recommendation. See `docs/` for the full picture; start with
`docs/ARCHITECTURE.md`.

## Status

**FINAL GAP CLOSURE phase (2026-09-16).** On top of the Final Intelligence
Completion phase below, this corrective phase closed a flagged architecture
defect and three product-completeness gaps:

- **Canonical Relationship Model** — corrected Cross-Source Intelligence's
  status as a structurally incompatible *third* relationship engine.
  `relationship-engine.ts`/`temporal-relationship-engine.ts` are unchanged;
  their output, plus Cross-Source/Ecosystem/Event relationships, now share
  one envelope (`HoodflowReport.relationshipGraph`) across five categories.
  See `docs/RELATIONSHIP_ARCHITECTURE.md`.
- **Intelligence Events** — a bounded, deterministic "what changed?" feed
  (`HoodflowReport.events`), built entirely from data other engines already
  computed. See `docs/INTELLIGENCE_EVENTS.md`.
- **Ecosystem Intelligence** — "what is connected to this token?"
  (`HoodflowReport.ecosystem`), built from data already fetched (GoPlus
  creator address, DexScreener dex/pair), zero new provider calls. See
  `docs/ECOSYSTEM_INTELLIGENCE.md`.
- **Robinhood Ecosystem Pulse** — the first genuinely chain-level view
  (`GET /v1/pulse/:chainId`), aggregating over every token actually scanned.
  See `docs/ROBINHOOD_ECOSYSTEM_PULSE.md`.

All four are additive — every pre-existing report field, route, and
frontend section is unchanged in shape and behavior (277 pre-existing tests
pass unmodified, plus 37 new tests this phase — 314 total). Three new/
updated frontend sections (`IntelligenceEvents.tsx`,
`EcosystemIntelligence.tsx`, a new `/pulse/[chainId]` page) were verified
with a real headless-browser pass (desktop + mobile, light + dark); one real
mobile-overflow defect was found and fixed during that pass (see
`docs/SECURITY.md`).

**Final Intelligence Completion phase (2026-09-15).** On top of everything through Phase 11
(research, monorepo foundation, the GoPlus/DexScreener/Blockscout provider
layer, the core intelligence pipeline, identity resolution, historical
intelligence + temporal relationships, a Next.js frontend QA'd in a real
browser, a live-data provider audit, a production-network verification
attempt, and a deployment readiness + security audit), this phase added:

- **Social Intelligence** — a real X (Twitter) API v2 client, normalized
  `SocialObservation`s, entity-resolved and source-quality-tagged. See
  `docs/SOCIAL_NEWS_INTELLIGENCE.md`.
- **News Intelligence** — a real GDELT DOC 2.0 API client, deterministic
  (non-LLM) event classification, syndicated-story de-duplication. Same
  doc.
- **Attention/Hype Intelligence** — a fully-exposed, documented formula
  over real social + news activity — explicitly not a meme score, not a
  buy/sell signal. See `docs/HYPE_ATTENTION.md`.
- **Cross-Source Intelligence** — a third relationship engine combining
  on-chain + historical + social + news + attention, with 11 typed
  relationship categories, non-causal language enforced throughout, and a
  Temporal Cross-Source Analysis step that requires real timestamps or
  explicitly reports `INSUFFICIENT_TEMPORAL_DATA`. See
  `docs/CROSS_SOURCE_INTELLIGENCE.md`.
- **Integrated Interpretation** — the final synthesis layer (what changed,
  do signals agree, where they diverge, what to monitor) as a new
  `HoodflowReport.integratedInterpretation` field.
- Four new frontend sections (Social Signals, News & Context, Attention,
  Cross-Source Intelligence) matching the existing dark-terminal aesthetic,
  plus a real favicon and a stale-copy fix found during browser QA.

All of this is additive: every pre-existing type, engine, route, and UI
section is unchanged in shape and behavior — see
`docs/ARCHITECTURE.md` §4. This sandbox still cannot reach any provider
(now including GDELT/X) via the repo's own client code, same policy-level
egress block confirmed again this phase, and this repository still isn't
on a durable remote (no git credential mechanism is configured here). No
deployer/wallet intelligence, no RPC client, no persistence beyond
in-memory history. See `docs/ROADMAP.md`.

## Layout

```
apps/api             Fastify API — GET /v1/report/:chainId/:address, GET /v1/pulse/:chainId, GET /healthz
apps/web              Next.js frontend — presentation layer over HoodflowReport (see docs/FRONTEND.md)
packages/core         Pure, dependency-free intelligence engine (no I/O)
packages/providers     GoPlus / DexScreener / Blockscout / GDELT / X clients + zod validation
docs/                  Architecture, data sources, scoring, security, roadmap
```

## Running it

```bash
pnpm install
pnpm -r run build
pnpm test              # 325 tests always run; +9 real Postgres integration tests when DATABASE_URL is set (see docs/HISTORY_SCHEMA.md)
cp apps/api/.env.example apps/api/.env   # optional: GOPLUS_API_KEY / BLOCKSCOUT_API_KEY / X_BEARER_TOKEN / DATABASE_URL
cp apps/web/.env.example apps/web/.env.local   # optional: HOODFLOW_API_BASE_URL (defaults to localhost:8787)
pnpm --filter @hoodflow/api run start    # after build, or `run dev` for tsx watch mode
curl http://localhost:8787/healthz       # legacy, kept for existing external health-check config
curl http://localhost:8787/liveness      # is the process alive
curl http://localhost:8787/readiness     # is this instance ready to serve traffic (never gates on provider reachability — see apps/api/src/health.ts)
curl http://localhost:8787/v1/report/4663/0xYOUR_TOKEN_ADDRESS
curl http://localhost:8787/v1/pulse/4663

# frontend (in a second terminal, with the API above already running on :8787)
pnpm --filter @hoodflow/web run dev      # http://localhost:3000
```

### Deploying the frontend: one required variable

`HOODFLOW_SITE_URL` must be set **at build time** (`robots.txt`, `sitemap.xml`
and the home page are statically prerendered, so a runtime-only value is not
picked up):

```bash
HOODFLOW_SITE_URL=https://your-domain.example pnpm --filter @hoodflow/web run build
```

Without it the app runs completely normally but deliberately serves
`noindex` and a `Disallow: /` robots.txt — a deployment that does not know
its own public origin cannot emit a truthful canonical URL, and a wrong
canonical is worse than not being indexed. This also means a preview or
staging deploy can never leak into a search index by accident. Set
`HOODFLOW_NOINDEX=true` to force `noindex` on a staging environment that
does have a real domain. **If production is unexpectedly not indexed, check
`HOODFLOW_SITE_URL` first.** See `apps/web/lib/site.ts` and
`apps/web/.env.example`.

Indexability at a glance: the home page is indexed; `/report/:chainId/:address`
and `/pulse/:chainId` are `noindex, follow` because they are client-rendered
application views (their server HTML is a loading shell) over an unbounded
URL space — see `apps/web/app/report/layout.tsx` for the full reasoning.

**Important:** this was built and tested inside a sandbox whose outbound
network access is policy-restricted to package registries only — the
provider clients' own HTTP calls (Node `fetch`, and plain `curl`) still
cannot reach GoPlus/DexScreener/Blockscout **or the two new providers,
GDELT and X**, from here (see `docs/ARCHITECTURE.md` §2), re-confirmed as
recently as this final phase (2026-09-15) with fresh proxy-log evidence for
all five hosts. All 314 tests run against realistic fixtures, not live
traffic. GoPlus and DexScreener's real API *shape* has been confirmed via a
separate, policy-trusted fetch path available only to this session (not
the repo's own client code, and not sufficient proof on its own — Phase 10
found a real numeric discrepancy between two supposedly-live captures of
the same field, most likely from that path's own response summarization,
not the provider). Blockscout remains fully blocked, including via that
trusted path (a WAF/bot-protection 403, distinct from the sandbox's own
egress block). GDELT and X were not separately checked via that
policy-trusted path this phase — see `docs/LIVE_VERIFICATION.md`'s Final
Intelligence Completion section for exactly what was and wasn't checked.
See `docs/LIVE_VERIFICATION.md` for the full picture and
`scripts/verify-live-providers.ts` for the reproducible way to close this
gap from an environment with normal outbound network access.

## Data integrity, in one sentence

Every external call resolves to an explicit `DataState`
(`AVAILABLE | PARTIAL | DATA_UNAVAILABLE | PROVIDER_UNAVAILABLE |
INVALID_INPUT | RATE_LIMITED | ERROR`); nothing downstream is allowed to
treat "missing" as "zero," "false," or "safe" — see `docs/ARCHITECTURE.md` §5.
