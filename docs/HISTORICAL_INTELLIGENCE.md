# HOODFLOW — Historical Intelligence (Phase 6)

Status: implemented this phase. Answers, cheaply and only from real
observations: **"What changed since the last scan?"** and **"What changed
together?"** — never a general-purpose time-series/charting feature. See
docs/INTELLIGENCE_ENGINE.md for how this slots into the rest of the
pipeline and docs/HISTORY_SCHEMA.md for the underlying HistoryStore this
builds on (unchanged this phase).

**Bug fixed (HOODFLOW MASTERPLUS audit, 2026-09-16):** both
`InMemoryHistoryStore.getPreviousSnapshot` and `PostgresHistoryStore.getPreviousSnapshot`
used a strict `<` comparison against `capturedAt`, which has only
millisecond resolution. Two real, sequential (not concurrent) scans of the
same token landing in the same millisecond would silently lose the earlier
scan for comparison purposes — the second scan would incorrectly report
`INSUFFICIENT_HISTORY` instead of a real `COMPARABLE` delta, degrading
"What Changed" from its intended behavior. Found via a real, previously
passing-by-coincidence test (`apps/api/test/report.route.test.ts`'s
back-to-back `app.inject()` calls) that started failing once traffic
patterns shifted, then reproduced deliberately and fixed by switching both
stores to `<=` — safe because both real call sites (`apps/api/src/routes/report.ts`)
always look up the previous scan *before* recording the current one, so a
scan can never match itself. Regression tests:
`packages/core/test/history-store.test.ts` and
`apps/api/test/postgres-history-store.test.ts`.

## Pipeline

```
HistoryStore.getPreviousSnapshot(token, capturedAt)   (unchanged, Phase 4)
  -> computeComparisons(current, previous)             MetricDelta[]   [historical/delta-engine.ts]
  -> computeTrends(comparisons)                         Trend[]         [historical/trend-engine.ts]
  -> detectTemporalRelationships(trends)                TemporalRelationship[]  [historical/temporal-relationship-engine.ts]
  -> buildHistoricalComparison(current, previous)       HistoricalComparison    [historical/build-history.ts, orchestrates the three above]
  -> buildHistoricalSignals(comparisons, now)            Signal[]        [historical/historical-signals.ts]
  -> build-report.ts: signals.push(...historicalSignals); report.history = comparison
```

`buildHistoricalComparison` and everything it calls is pure — no I/O, no
randomness, deterministic — same posture as every other engine in this
codebase. It only ever looks at the current snapshot plus, at most, the
single immediately-previous snapshot for the *same* token (chain +
normalized contract address, via `HistoryStore.getPreviousSnapshot`,
unchanged from Phase 4). It never scans full history and never compares
across tokens.

## Why two-point comparison only (this phase)

The spec explicitly allows deferring velocity/rate-of-change ("100k → 120k
→ 180k may indicate accelerating growth, but 100k → 101k should not be
presented as meaningful acceleration... otherwise explicitly defer, don't
add complexity simply because historical data exists"). `HistoryStore`
already has `getScansSince` for multi-observation queries, but nothing in
the current analyzer/report layer needs more than one prior point yet, and
building a rate-of-change engine on top of two arbitrary points would
either be meaningless (noise) or require a minimum-sample-size policy that
doesn't exist yet. Deferred, not forgotten — `getScansSince` is already the
right primitive for it later.

## History model — reused, not replaced

`HistoryStore`/`InMemoryHistoryStore` (Phase 4) are unchanged this phase.
`tokenKey(token) = "${chainId}:${address.toLowerCase()}"` already satisfies
"historical observations tied to chain + normalized contract address, never
symbol/name" by construction — nothing in Phase 6 needed to touch it.
`MAX_SCANS_PER_TOKEN = 1000` per-token cap is unchanged; the known,
documented gap (no cap on distinct-token count) is unchanged and remains a
Postgres-migration item, not something Phase 6 needed to fix to build
two-point comparison.

## Historical identity

Never symbol/name-keyed. `HistoryStore.tokenKey()` already enforces this;
Phase 6 adds nothing new here because nothing needed to change — history is
looked up via `snapshot.token` (chain + normalized address), and identity
resolution (Phase 5) is computed independently per scan and never
influenced by, or allowed to influence, the historical comparison. If
`snapshot.identity` differs between the previous and current scan (e.g. a
registry entry is added between two real scans), the historical
value/delta comparison is unaffected — `buildHistoricalComparison` never
reads `TokenSnapshot.identity` at all. A conflict, if one exists, is
preserved as-is at each scan's own `report.identity`, never rewritten
retroactively.

## Data integrity: missing != zero, unavailable != false

`historical/delta-engine.ts::computeMetricDelta` is the single place this
is enforced for history. A value only becomes part of a delta calculation
when its domain's `DataState` is `AVAILABLE`/`PARTIAL` *and* the field is
present *and* finite (`Number.isFinite`) *and* non-negative for these
metrics (liquidity/holder-count/concentration can never legitimately be
negative — a negative value reaching here means corrupted or
attacker-controlled provider data, not a real observation).

Two worked examples straight from the spec, both now regression-tested
(`packages/core/test/delta-engine.test.ts`):

- Previous liquidity = $100,000, current liquidity = unavailable ->
  `status: UNAVAILABLE`, `absoluteChange: null`, `percentChange: null`.
  **Never** "decreased 100%".
- Previous holder count = unavailable, current = 500 -> `status:
  UNAVAILABLE`, `absoluteChange: null`. **Never** implies "+500 holder
  growth".

`DeltaStatus` has six values, each with a distinct, tested meaning:
`INCREASED` / `DECREASED` / `UNCHANGED` (real, comparable, below the noise
threshold) / `UNAVAILABLE` (a previous scan exists, but this metric wasn't
usable on one or both sides) / `INSUFFICIENT_HISTORY` (no previous scan
exists for this token at all) / `NOT_COMPARABLE` (defensive: a value
outside its physically valid range, e.g. negative).

## Delta Engine thresholds

Reuses the existing HOLDER_GROWTH noise threshold exactly
(`analyzers/holders-analyzer.ts`: `Math.abs(pctChange) < 1` -> UNCHANGED)
for every amount-style metric (liquidity, holder count):
**`NOISE_THRESHOLD_PCT = 1` (1% of the previous value)**. Concentration
(`top10Pct`/`top20Pct`) is already a percentage, so its delta is a
**percentage-point** change, not a percentage-of-a-percentage — confusing
these two was an explicit spec warning ("+5 percentage points" is not
"+5 percent"). A new, analogous, equally first-pass threshold applies:
**`NOISE_THRESHOLD_PP = 1` (1 percentage point)**. Both are documented
constants in `historical/delta-engine.ts`, same "reasonable starting
point, not calibrated" posture as every other threshold in
docs/SCORING.md.

`confidence` on every `MetricDelta` is `MEDIUM`, never `HIGH` — a single
prior-scan comparison, not a smoothed trend, exactly matching
HOLDER_GROWTH's own stated rationale. `null` only when there's nothing to
be confident about (`INSUFFICIENT_HISTORY`/`UNAVAILABLE`/`NOT_COMPARABLE`).

`previousValue === 0` for an amount metric makes `percentChange`
mathematically undefined (division by zero) — handled explicitly:
`percentChange: null` with a factual `note`, while `absoluteChange` (and
therefore `status`) is still computed from the real, valid absolute
numbers.

## Trend Engine

`historical/trend-engine.ts::computeTrends` classifies each comparable
delta:

| Delta status | Trend |
|---|---|
| `INCREASED` | the metric's `*_INCREASING` TrendType |
| `DECREASED` | the metric's `*_DECREASING` TrendType |
| `UNCHANGED` | `NO_TREND` — a real conclusion ("no significant change"), not a stand-in for missing data |
| `INSUFFICIENT_HISTORY` / `UNAVAILABLE` / `NOT_COMPARABLE` | no trend entry at all |

Only `liquidityUsd`, `holderCount`, and `top10Pct` have a dedicated
`TrendType` mapping. `top20Pct`'s delta is still exposed in
`history.comparisons`, but adding a second concentration trend type would
duplicate `top10Pct`'s signal without a genuinely distinct interpretation
— deliberately not built, to avoid trend explosion.

`Trend.direction` uses a **new, dedicated** `TrendDirection`
(`INCREASING`/`DECREASING`/`UNCHANGED`) rather than reusing
`intelligence.ts`'s `Direction` (`POSITIVE`/`NEGATIVE`/`NEUTRAL`).
These are not equivalent even though they're isomorphic in shape:
`Direction` is a risk-valence judgment (`TOP10_CONCENTRATION`'s NEGATIVE
means "elevated, unfavorable"), while a Trend's direction is purely "which
way did the number move" — concentration *increasing* is `INCREASING`
here regardless of whether increasing concentration is good or bad. That
risk-valence judgment is made once, explicitly, only when a Trend is
turned into a Signal (see Historical Signals below) — never inside the
Trend Engine itself.

## Temporal Relationships — "the most important part of Phase 6"

`historical/temporal-relationship-engine.ts::detectTemporalRelationships`
is a **small, deliberately non-exhaustive** set — five relationship types,
not "dozens of combinations":

- `LIQUIDITY_PARTICIPATION_ALIGNMENT` — liquidity and holder count moved
  the same direction.
- `LIQUIDITY_PARTICIPATION_DIVERGENCE` — liquidity and holder count moved
  opposite directions.
- `PARTICIPATION_CONCENTRATION_DIVERGENCE` — holder count and top-10
  concentration moved opposite directions (covers both "broadening"
  and "narrowing").
- `BROAD_BASED_LIQUIDITY_GROWTH` — liquidity↑ + holders↑ + concentration↓
  (the spec's canonical three-way example).
- `CONCENTRATED_LIQUIDITY_GROWTH` — liquidity↑ + concentration↑ + holders
  not increasing (the spec's canonical counter-example, with a
  deliberately different interpretation string from the case above).

The two three-way patterns are checked **first** and, when one matches,
returned **alone**: they already subsume what the corresponding two-way
relationships would separately claim about the exact same two data points,
so emitting both would be a redundant claim from a single comparison, not
new information.

**Deliberately a separate engine from
`relationships/relationship-engine.ts`**, not an extension of it: that
engine combines same-snapshot Signals (buy/sell imbalance, liquidity
strength, etc.); this one combines cross-snapshot Trends — a structurally
different input. Keeping them apart means neither can influence the
other's output, and — critically — neither influences
`marketState`/`score.dataQualityScore` (see "Score integrity" below).
`TemporalRelationship` reuses `Confidence` from `types/intelligence.ts` but
has its own `TemporalRelationshipType` rather than extending the existing
`RelationshipType`, for the same reason `TrendDirection` isn't `Direction`:
not equivalent, just similarly shaped.

**No causation, ever.** Every interpretation and evidence string uses only
"coincided with" / "occurred alongside" / "the observed data shows" /
"was accompanied by" framing. `packages/core/test/temporal-relationship-engine.test.ts`
asserts, across every reachable relationship combination, that no
interpretation or evidence string matches `/\b(caused|will cause|guarantees|proves)\b/i`.

Confidence is `MEDIUM` for every temporal relationship, including the
three-way cases — three metrics agreeing at the *same* two timestamps
isn't three independent samples, so it doesn't earn `HIGH` just because
more metrics line up.

## Historical Signals

`historical/historical-signals.ts::buildHistoricalSignals` is
**deliberately narrow** — it does not duplicate `HOLDER_GROWTH`, which
already has a working, tested signal path in
`analyzers/holders-analyzer.ts` driven by a previous-scan comparison of
its own (unchanged this phase; `report/build-report.ts` still derives
`previousHolderCount` and passes it through exactly as before, just now
sourced from `options.previousSnapshot` instead of a separately-computed
number). Only two signal families are new/activated this phase:

- `LIQUIDITY_GROWTH` / `LIQUIDITY_DECLINE` — typed since Phase 0
  ("activate once the HistoryStore has at least two snapshots for the
  token" — `analyzers/liquidity-analyzer.ts`'s own doc comment) but unused
  until now.
- `HOLDER_CONCENTRATION_INCREASE` / `HOLDER_CONCENTRATION_DECREASE` — new
  this phase. `TOP10_CONCENTRATION` already covers "how concentrated is it
  right now"; nothing covered "is concentration changing over time" before
  Phase 6.

Strength tiers: liquidity reuses HOLDER_GROWTH's exact percentage
thresholds (HIGH ≥20%, MEDIUM ≥5%); concentration uses percentage-point
thresholds (HIGH ≥10pp, MEDIUM ≥3pp) — smaller because point-moves in an
already-bounded 0-100 scale are naturally smaller in magnitude than
percent-of-value moves. Both first-pass, documented, changeable.

**Placement**: these signals are appended to `report.signals` **after**
the market Relationship/Evidence/`marketState` sweep has already run — the
exact same placement Phase 5 used for identity signals, and for the same
reason: informational, never an input to `marketState` or
`score.dataQualityScore`. See "Score integrity" below.

## Historical Evidence

`MetricDelta` **is** HOODFLOW's historical evidence record — there is no
separate, duplicate evidence array. Every entry in `report.history.comparisons`
always preserves: the metric name, previous value, current value, previous
timestamp, current timestamp, calculated delta (absolute + percent or
percentage-point as appropriate), confidence, and comparison status. Never
fabricated: if a value, timestamp, or delta isn't directly derivable from
the two real snapshots involved, the corresponding field is `null` and
`status` reflects why (`UNAVAILABLE`/`INSUFFICIENT_HISTORY`/`NOT_COMPARABLE`),
never inferred or guessed.

## Report / API

`HoodflowReport.history: HistoricalComparison`:

```ts
interface HistoricalComparison {
  status: "COMPARABLE" | "INSUFFICIENT_HISTORY";
  observationsUsed: 1 | 2;      // 1 = current only, 2 = current + previous. Not a claim about total history depth.
  currentObservedAt: string;
  previousObservedAt: string | null;
  comparisons: MetricDelta[];   // also the historical-evidence record — see above
  trends: Trend[];
  relationships: TemporalRelationship[];
}
```

A future frontend can answer "what changed?" directly from this block
without recalculating any intelligence itself — every number, timestamp,
and interpretation it would need is already here.

## Score integrity

**`score.dataQualityScore` and `marketState` are byte-for-byte unchanged by
history — proven by test, not just asserted** (`build-report.test.ts`,
"Score integrity" describe block: an otherwise-identical report with and
without a `previousSnapshot` produces the same `marketState.state` and the
same `score.dataQualityScore`).

Mechanically, this holds for the same reason it held for Phase 5 identity:
`marketLimitationsCount` is captured immediately after the
contract/liquidity/holders block, **before** any identity or historical
limitation is pushed onto `limitations`, and only that captured count
feeds `dataQuality.overallConfidencePenalty`. Historical signals are
appended to `signals` only after `detectRelationships`/`buildEvidence`/
`selectMarketState` have already run on the market-only signal set, so
they cannot enter that sweep or change `marketState`. `history` itself is
a report field, read by callers directly — it is not consulted anywhere
inside the market pipeline. **Absence of history is not evidence of
risk**: `INSUFFICIENT_HISTORY` adds exactly one limitation string (for
transparency) and nothing else.

## Current vs. historical

The report never blends an old observation into a current value. If
current liquidity is `DATA_UNAVAILABLE`, `report.dataQuality.liquidity`
says so and `report.history.comparisons` shows that metric's `currentValue:
null` — never a stale "$135k (+35%)" carried over from a prior scan. The
two are structurally separate fields (`snapshot.liquidity` vs.
`report.history.comparisons`), so there's no code path where one can leak
into the other.

## Performance

`buildHistoricalComparison` is O(1) in the number of metrics compared (a
fixed set of four) — it never scans full history and never compares across
tokens. The route (`apps/api/src/routes/report.ts`) calls
`HistoryStore.getPreviousSnapshot`, an O(scans-for-this-token) lookup
already bounded by `MAX_SCANS_PER_TOKEN = 1000` (Phase 4, unchanged) — not
`O(all historical observations)`.

## Security review (Phase 6)

Re-audited specifically against what changed this phase:
`historical/delta-engine.ts`, `trend-engine.ts`,
`temporal-relationship-engine.ts`, `historical-signals.ts`,
`build-history.ts`, and the new `history`/`previousSnapshot` wiring in
`report/build-report.ts` and `apps/api/src/routes/report.ts`.

- **No new I/O surface at all.** Every new module in `historical/` is pure
  computation over already-fetched, already-validated `TokenSnapshot`
  data — none of them construct a URL, open a socket, or touch the
  filesystem. `HistoryStore` itself is unchanged.
- **NaN/Infinity/negative values are rejected before arithmetic**, not
  after: `usableValue()` in `delta-engine.ts` requires `Number.isFinite`;
  a negative value on either side produces `NOT_COMPARABLE` rather than a
  misleading delta. Regression-tested
  (`delta-engine.test.ts`: "negative provider-supplied values",
  "NaN/Infinity provider values").
- **Division by zero is handled explicitly**, not defensively-avoided by
  luck: `previousValue === 0` for an amount metric sets `percentChange:
  null` with a factual note rather than computing `Infinity` or `NaN`.
  Regression-tested ("zero is a valid, real value where legitimate").
- **No unbounded memory growth.** `historical/*` holds no state of its own
  between calls — every function is stateless, operating only on its
  arguments. `HistoryStore`'s existing, already-documented bound
  (`MAX_SCANS_PER_TOKEN = 1000`, no cap on distinct-token count) is
  unchanged; Phase 6 adds no new store, no new cache, no new `Map`.
  Duplicate/future timestamps: `build-history.test.ts` covers both
  ("duplicate timestamps between previous and current", "a future-dated
  previous snapshot") — neither crashes or produces a `NaN`/`Infinity`
  result; a future-dated previous scan just yields a real (possibly
  negative) `absoluteChange`, which is mathematically correct given
  whatever timestamps `HistoryStore` actually returned. `HistoryStore`
  itself doesn't validate timestamp ordering (Phase 4 behavior, unchanged) —
  out of scope for Phase 6 to redesign, since nothing in the historical
  engines assumes strictly-increasing timestamps beyond what
  `getPreviousSnapshot`'s own "most recent scan strictly before" logic
  already guarantees.
- **No O(n²) or unbounded-complexity path.** `computeComparisons` iterates
  a fixed 4-element metric list; `computeTrends` and
  `detectTemporalRelationships` are both linear in that same small,
  bounded input. Nothing here scales with total history depth.
- **No log/secret leakage.** None of the new modules log anything; the
  route's existing log line (`{chainId, addressPrefix}`) is unchanged.
  Evidence/interpretation strings are built from already-validated numeric
  fields via template literals, the same pattern used everywhere else in
  this codebase since Phase 0.
- **Attacker-controlled provider values**: covered by the NaN/Infinity/
  negative-value handling above, plus the pre-existing
  `DataState`/zod-boundary validation (Phase 0-4, unchanged) that all
  provider data already passes through before it ever reaches a
  `TokenSnapshot`.
- **Dependency audit**: unchanged — zero vulnerabilities in production
  dependencies; the same 6 dev-only `vitest`/`vite`/`@vitest/mocker`
  advisories as every prior phase. No new dependencies were added.

## Test coverage

159/159 tests passing (104 baseline + 55 new): `delta-engine.test.ts` (13),
`trend-engine.test.ts` (9), `temporal-relationship-engine.test.ts` (10),
`historical-signals.test.ts` (9), `build-history.test.ts` (6), plus 6 new
cases in `build-report.test.ts` and 2 new end-to-end cases in
`apps/api/test/report.route.test.ts` covering the full
scan-1-then-scan-2 flow through the live route, including the canonical
`BROAD_BASED_LIQUIDITY_GROWTH` scenario and a provider-going-unavailable
scenario proving no fabricated "-100%" delta.
