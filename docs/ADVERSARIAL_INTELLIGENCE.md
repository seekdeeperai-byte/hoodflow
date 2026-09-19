# HOODFLOW — Adversarial Intelligence (MANIPULATION_RADAR)

Status: implemented 2026-09-19. Product-facing name: **Adversarial Signals**.
Internal codename: `MANIPULATION_RADAR`.

## What this answers

> Do multiple independent observations form an unusual pattern that deserves
> attention?

It does **not** answer "is this token manipulated?", and it is designed so
that it cannot drift into answering that question later:

- **No numeric score.** A "manipulation score" invites ranking, thresholding,
  and eventually a buy/sell reading. Signals are explainable categorical
  states with attached evidence, which cannot be collapsed that way.
- **No `MANIPULATED` / `SCAM` / `FRAUD` status.** A signal's `status` is about
  whether HOODFLOW could *observe a pattern*, never about intent.
- **Severity stops at `ELEVATED`.** There is no "critical"/"danger" tier,
  because nothing this layer can observe justifies alarm language.
- **Evidence is structurally required.** `AdversarialSignal.evidence` is not
  optional, and `observed()` in the engine is the only constructor for an
  OBSERVED signal — it downgrades to `DATA_UNAVAILABLE` rather than emit a
  claim with an empty evidence array.
- **A regression test asserts the vocabulary.** `adversarial-engine.test.ts`
  fails the build if the words "scam", "fraud", "manipulated", "rug",
  "guaranteed", "caused" or "proves" ever appear in a generated explanation.

## Where it sits

`packages/core/src/adversarial/adversarial-engine.ts` — a pure function, no
I/O, no provider, deterministic. It is called from `report/build-report.ts`
**after** `marketState` and `score.dataQualityScore` are finalized, exactly
like every other post-market-sweep layer (identity, history, social/news,
cross-source, ecosystem). An unusual pattern therefore cannot silently move a
number a user reads as a data-quality measure.

Output: `HoodflowReport.adversarial`.

## Zero new providers

Every input is data another engine already produced:

| Input | Comes from |
|---|---|
| liquidity, `buys24h`/`sells24h`, `liquidityUsd` | DexScreener via `snapshot.liquidity` (current + previous scan) |
| `top10Pct` | Blockscout via `snapshot.holders` |
| trends, comparability, window bounds | `historical/` (`HistoricalComparison`) |
| `mentionVelocityChange` | `social/social-analyzer.ts` |
| `coverageVelocityChange` | `news/news-analyzer.ts` |
| identity status, `EntityMatch.basis` | `identity/` + `resolve-entity-mention.ts` |

The layer is completely **passive**: it reads already-fetched data, and it
does not send messages, contact anyone, touch wallets, execute anything,
fetch a URL, or scrape a service.

## Signals implemented

| Signal | Fires when |
|---|---|
| `LIQUIDITY_ACTIVITY_MISMATCH` | Trade count moved ≥25% and diverged from the liquidity change by ≥40 percentage points, with a comparable prior scan |
| `SOCIAL_ACCELERATION` | Mention velocity rose ≥0.5 posts/hour against the token's own baseline; states explicitly whether on-chain corroborates |
| `NARRATIVE_ACCELERATION` | Distinct-story coverage velocity rose ≥0.5 stories/hour against the token's own baseline |
| `CONCENTRATION_ACTIVITY_INTERACTION` | Top-10 ≥50% **and** a ≥25% activity change — an interaction that changes how much weight concentration deserves, never a prediction |
| `TEMPORAL_COORDINATION` | Two or more independent domains changed inside one observation window. Adjacency only |
| `IDENTITY_NARRATIVE_CONFLICT` | Identity is AMBIGUOUS/CONFLICTING **and** external coverage attaches on weak grounds (ambiguous symbol / no match) |

Every signal is always returned, even when it cannot be evaluated, with one
of four statuses: `OBSERVED`, `NOT_OBSERVED`, `INSUFFICIENT_TEMPORAL_DATA`,
`DATA_UNAVAILABLE`. That is deliberate — a reader must be able to tell
"checked and absent" from "never checked", and an unevaluated pattern must
never read as reassurance.

## Confidence calibration

`LOW` = one observation, nothing corroborating. `MEDIUM` = two independent
sources, or one plus comparable history. `HIGH` = three or more independent
sources **and** comparable history.

One correction worth recording: `history` is deliberately **excluded** from
the independent-source count. The history store is not a fourth provider — it
is a record of earlier observations from the same providers, so counting it
both as a source and as `hasComparableHistory` double-counts it. Before this
was fixed, `CONCENTRATION_ACTIVITY_INTERACTION` reached HIGH confidence off
what is really two measurements.

## Honesty caveats carried in the data

`buys24h`/`sells24h` are the provider's **rolling 24-hour** totals. Two scans
taken close together cover heavily overlapping windows, so a change is a
change in a rolling aggregate, not a count of trades between the scans. That
caveat is attached to the evidence item itself (`AdversarialEvidence.caveat`)
and rendered in the UI — not buried in this document.

Similarly, two consecutive observations can show acceleration but cannot
establish whether it is **sustained** or **repeated**; the narrative signal
says so in its own evidence.

## Integration with existing models

- **Canonical relationships:** observed signals are adapted into the existing
  `CanonicalRelationship` shape via `toCanonicalAdversarialRelationships()`,
  under a sixth category, `ADVERSARIAL`. No parallel relationship graph was
  created. It is deliberately *not* filed under `CROSS_SOURCE`, which means
  "cross-source-engine.ts's output" — mislabelling it would make the category
  field lie about provenance. Only OBSERVED signals become relationships.
- **Events:** one `MANIPULATION_SIGNAL_DETECTED` event
  (category `ADVERSARIAL`) per observed pattern, with a deterministic id so
  re-scanning unchanged state cannot spam the feed. Significance is capped at
  MEDIUM. Named for what it is: a *signal* was detected, not manipulation.

## Deliberately NOT implemented

- **`ECOSYSTEM_COORDINATION`** (multiple tokens, same creator, overlapping
  activity). `buildReport` is a pure function over **one** token's snapshot
  and has no access to the `HistoryStore`, so it structurally cannot see other
  tokens. Implementing it would require either threading store access into the
  report builder (an architecture change this pass was told not to make) or
  building it at the Pulse level, which is chain-scoped. Fabricating it from
  single-token data would violate the evidence rules outright. This is the
  correct home for a future phase, and the canonical `ECOSYSTEM` relationships
  it would build on already exist.
- **Sustained / repeated acceleration.** Needs an N-point history; the current
  comparison is two-point. Reported as a caveat rather than guessed at.
- **Deployer history / related deployments.** Requires transaction-graph data
  the provider layer does not have (see `docs/ROADMAP.md`); a single-hop
  `DEPLOYED_BY` relationship exists in Ecosystem Intelligence and is not
  enough on its own to say anything about coordination.
- **Wash-trading / self-trading detection.** Needs per-trade or per-wallet
  data. HOODFLOW only has aggregate buy/sell counts, and inferring wash
  trading from aggregates would be exactly the kind of unfounded accusation
  this layer exists to avoid.

## Adversarial test fixtures

`packages/core/test/adversarial-engine.test.ts` covers the spec's A–H matrix:
social spike with no baseline (A), activity spike with flat liquidity (B),
high concentration with no activity change (C), social + on-chain
acceleration (D), malformed provider data (E), identity collision (F),
same-millisecond scans (G), and a malformed/legacy history record (H).

Two real defects were found by these fixtures during development and fixed:

1. `TEMPORAL_COORDINATION` reported `NOT_OBSERVED` when *no* domain had usable
   data — turning a total absence of evidence into a reassuring "checked,
   nothing here". It now reports `DATA_UNAVAILABLE` unless at least one domain
   was actually readable.
2. A malformed previous snapshot (a legacy history record missing a whole
   domain object) crashed the report with a `TypeError`. The unsafe accesses
   were pre-existing — `previousSnapshot?.holders.data`,
   `previous?.liquidity.state` in `delta-engine.ts` and others — and are now
   optional-chained through every level. This is the same defect class
   previously fixed in `pulse-engine.ts`.
