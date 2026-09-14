# HOODFLOW — Scoring & Thresholds

All thresholds below are first-pass, documented-and-changeable constants,
not tuned against real Robinhood Chain data yet (there isn't any real
traffic history to tune against). Treat every number here as "reasonable
starting point," not "calibrated." Revisit once real reports have been run
against live tokens.

## `dataQualityScore` (0–100)

**Not a risk score and not a price signal.** It is the percentage of the
three current data domains (contract, liquidity, holders) that returned
`AVAILABLE`/`PARTIAL` data. A low score means "trust this report less
because HOODFLOW couldn't see much," not "this token is risky." See
`packages/core/src/report/build-report.ts::dataQualityScore`.

## Contract signal thresholds (`packages/core/src/analyzers/contract-analyzer.ts`)

| Signal | Trigger |
|---|---|
| `FEE_RISK` | buy or sell tax ≥ 10% (MEDIUM), ≥ 25% (HIGH) |
| `TOP10_CONCENTRATION` | top-10 holders ≥ 50% of supply (MEDIUM/NEGATIVE), ≥ 70% (HIGH) |
| `OWNERSHIP_RISK` | non-zero owner address; HIGH/NEGATIVE only if `can_take_back_ownership` or `hidden_owner` |

Everything else (mint, honeypot, blacklist, pause capability) is a direct
boolean pass-through from GoPlus — presence alone is enough to emit the
signal, because these are binary capabilities, not degrees.

## Liquidity signal thresholds (`packages/core/src/analyzers/liquidity-analyzer.ts`)

| Signal | Trigger |
|---|---|
| `LIQUIDITY_STRENGTH` | NEGATIVE/HIGH if liquidity < $10k; POSITIVE/MEDIUM if ≥ $100k |
| `MC_LIQUIDITY_DIVERGENCE` | market cap / liquidity ≥ 10x (MEDIUM), ≥ 30x (HIGH) |
| `VOLUME_LIQUIDITY_DIVERGENCE` | 24h volume / liquidity ≥ 3x (MEDIUM), ≥ 8x (HIGH) |
| `BUY_SELL_IMBALANCE` | buy share deviates ≥15pp from 50% (MEDIUM), ≥30pp (HIGH); requires ≥10 total txns to avoid noise on thin samples |
| `PRICE_MOMENTUM` | |24h price change| ≥ 15% (MEDIUM), ≥ 50% (HIGH) |

**Why ratios, not growth-over-time, in this build:** a single DexScreener
call is one point in time. The product spec's canonical example ("MC +74%,
Volume +112%, Liquidity +6%") is a *rate-of-change* comparison, which needs
two snapshots. The ratio-based signals here (mc/liquidity, volume/liquidity)
are a legitimate, defensible single-snapshot proxy for the same underlying
concern — "is activity outrunning depth" — and they activate on the very
first scan of a token. True growth-rate signals (`LIQUIDITY_GROWTH`,
`LIQUIDITY_DECLINE`) are typed in `packages/core/src/types/intelligence.ts`
already but not implemented — they need the HistoryStore (Phase 4) to have
at least two captures for the same token.

## Confidence

`Confidence` (LOW/MEDIUM/HIGH) on a Relationship starts at the level set by
the Relationship Engine (`packages/core/src/relationships/relationship-engine.ts`)
based on how many of its expected supporting signals are present, and gets
downgraded by exactly one level in the Evidence Engine
(`packages/core/src/evidence/evidence-engine.ts`) if a signal search *outside*
the ones used to build the relationship contradicts its direction. This is
the mechanical implementation of "contradictory evidence lowers confidence"
(product spec §19) — it's a fixed one-step downgrade, not a weighted
formula, because there isn't yet a labeled dataset to fit weights against.

## Market state selection

Deterministic priority order (`packages/core/src/interpretation/market-state.ts`):

```
no signals at all              -> INSUFFICIENT_DATA
HIGH-strength negative          -> CONTRACT_RISK
  contract signal present
SPECULATIVE_OVERHEATING         -> SPECULATIVE
  relationship present
LIQUIDITY_LAGGING_ACTIVITY      -> LIQUIDITY_STRESS
  relationship at HIGH confidence
DEMAND_EXPANSION relationship   -> DEMAND_EXPANSION
  at MEDIUM+ confidence
COOLING relationship present    -> COOLING
positive liquidity strength,    -> HEALTHY_FLOW
  no relationships at all
otherwise                       -> INSUFFICIENT_DATA
```

`ACCUMULATION`, `OVERHEATED`, and `DISTRIBUTION` are typed but not yet
reachable — they need holder-trend and wallet-cluster signals that aren't
implemented yet (Phase 4/social layer). Listing them as unreachable here
rather than quietly leaving them dead code, so the next contributor knows
they're intentional placeholders, not bugs.
