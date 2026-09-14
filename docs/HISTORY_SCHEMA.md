# HOODFLOW — Historical Persistence: Schema & Design

Status: interface + in-memory implementation built this phase (Phase 4);
a real Postgres implementation is Phase 4.5/5, deliberately deferred until
a deployment target/DB decision is made (see the Phase 4 report's
"needs product-owner input"). This doc is written so that decision is a
schema-mapping exercise, not a design exercise.

## Design goal (from the product spec)

Answer, cheaply: **"What changed since the last observation?"**, and
eventually: **"What has been happening over the last 1h/6h/24h/7d?"**
Nothing more. This is explicitly not a general-purpose time-series
database or an event-sourcing system — it's a record of what HOODFLOW
observed, when, so the next observation can be compared against it.

## Entities (minimum viable set — no social/news persistence yet, per spec §7)

```
token
  chain_id            int
  address              text (lowercased)
  first_seen_at         timestamptz
  PRIMARY KEY (chain_id, address)

scan
  id                    uuid/bigserial PRIMARY KEY
  chain_id              int
  address                text
  requested_at            timestamptz   -- FETCH_TIME for this whole scan
  data_quality_score      int
  market_state            text
  market_state_confidence  text
  FOREIGN KEY (chain_id, address) REFERENCES token

provider_observation      -- one row per provider call within a scan
  id                     uuid/bigserial PRIMARY KEY
  scan_id                 FK -> scan
  provider                text            -- 'goplus' | 'dexscreener' | 'blockscout'
  data_state               text            -- the DataState enum value, verbatim
  http_status               int NULL
  latency_ms                 int NULL
  error                       text NULL     -- never a secret, never a stack trace (see docs/SECURITY.md)
  fetched_at                  timestamptz

liquidity_snapshot          -- present only when the liquidity provider_observation was AVAILABLE/PARTIAL
  id                      uuid/bigserial PRIMARY KEY
  scan_id                  FK -> scan (1:1)
  price_usd                 numeric NULL
  liquidity_usd              numeric NULL
  market_cap_usd               numeric NULL
  fdv_usd                       numeric NULL
  volume_usd_24h                 numeric NULL
  price_change_pct_24h             numeric NULL
  buys_24h                          int NULL
  sells_24h                          int NULL
  captured_at                         timestamptz

holder_snapshot              -- present only when the holders provider_observation was AVAILABLE/PARTIAL
  id                       uuid/bigserial PRIMARY KEY
  scan_id                   FK -> scan (1:1)
  holder_count                int NULL
  top10_pct                     numeric NULL
  top20_pct                       numeric NULL
  captured_at                       timestamptz

signal                        -- denormalized copy of what the Signal Engine produced for this scan
  id                        uuid/bigserial PRIMARY KEY
  scan_id                    FK -> scan
  signal_type                  text
  direction                     text
  strength                        text
  confidence                       text
  source                             text
  evidence                             text
  timestamp                              timestamptz

relationship
  id                        uuid/bigserial PRIMARY KEY
  scan_id                    FK -> scan
  relationship_type            text
  confidence                     text
  supporting_signals               text[]   -- SignalType values
  contradicting_signals              text[]
  evidence                             text[]
  interpretation                          text

interpretation
  id                        uuid/bigserial PRIMARY KEY
  scan_id                    FK -> scan
  headline                    text
  summary                       text
  confidence                     text
  limitations                      text[]
  what_would_change_assessment       text[]
```

**Deliberately not modeled yet:** `wallet_observation` (needs a
transaction-graph data source that doesn't exist yet — see
docs/ROADMAP.md), `social_observation`, `news_observation` (Phase 5, per
the spec's own explicit instruction not to build this before the core
foundation is trustworthy).

## Indexing (for the actual query pattern, not speculative ones)

- `scan (chain_id, address, requested_at DESC)` — "give me the most recent
  scan for this token" and "give me every scan for this token in the last
  N hours" are the only two query shapes anything needs right now.
- `provider_observation (scan_id)`, `liquidity_snapshot (scan_id)`,
  `holder_snapshot (scan_id)` — all 1:1 or 1:N off `scan_id`, covered by
  the FK.

## Retention (a decision, not yet made)

Not decided. Options: keep every scan forever (simplest, cheapest at this
volume, easiest to reason about "what changed"), or roll up anything older
than N days into hourly/daily aggregates. Flagging this as a real decision
for whoever owns the DB, not deciding it here — premature to optimize
storage for a system with zero production traffic yet.

## What's actually implemented this phase (code, not just schema)

`packages/core/src/history/history-store.ts` defines the `HistoryStore`
interface: `recordScan(entry)`, `getPreviousSnapshot(token, before)`,
`getSnapshotsSince(token, since)`. `InMemoryHistoryStore`
(`packages/core/src/history/in-memory-history-store.ts`) implements it as
an in-process `Map`, which is enough to make `HOLDER_GROWTH` a real,
working signal end-to-end (see docs/INTELLIGENCE_ENGINE.md) without
standing up a database before there's a deployment target to run one on.
**This in-memory store loses all history on process restart** — that's
fine for proving the mechanism works, not fine for production; swapping in
a Postgres-backed implementation of the same interface is the entire
migration (`apps/api/src/server.ts` is the only place that constructs a
`HistoryStore` — see that file's comment).
