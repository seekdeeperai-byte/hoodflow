# HOODFLOW — Attention / Hype Intelligence

Status: **IMPLEMENTED**, deterministic, fully computed from real
`SocialSummary`/`NewsSummary` data (docs/SOCIAL_NEWS_INTELLIGENCE.md). Added
in the Final Intelligence Completion phase (2026-09-15), governing spec §5.
Reuses the existing `HypeState` enum unchanged — see "Why HypeState, not a
new AttentionState enum" below.

## What this is not (read this first)

Per §5 of the governing spec, `HoodflowReport.hype` is explicitly:

- **Not a meme score.** It never encodes a value judgment about the token
  or the people discussing it.
- **Not a buy/sell signal.** `computeAttention()`
  (`packages/core/src/attention/attention-engine.ts`) never reads price,
  liquidity level, or any market-direction data — only social/news
  activity counts and velocities. It cannot recommend anything because it
  has no access to the inputs a recommendation would require.
- **Not a hidden black box.** Every input that produced `state`/`score` is
  returned in `HoodflowReport.hype.components` and explained in plain
  language in `hype.reasoning` — nothing about the classification is
  opaque.

## Why `HypeState`, not a new `AttentionState` enum

The governing spec suggests a new `AttentionState` enum
(`LOW_ACTIVITY | NORMAL_ACTIVITY | RAPIDLY_ACCELERATING | ...`). HOODFLOW
already had a structurally equivalent `HypeState` enum in
`packages/core/src/types/intelligence.ts`, unused until this phase. Per
this project's "reuse existing abstractions, do not invent a parallel
architecture" rule (Rule 0 of this phase, and every phase before it), that
existing enum was extended in place rather than adding a second one that
would mean the same thing:

| `HypeState` (used) | Spec's suggested `AttentionState` |
|---|---|
| `QUIET` | `LOW_ACTIVITY` |
| `EMERGING` | `NORMAL_ACTIVITY` |
| `ACCELERATING` | `RAPIDLY_ACCELERATING` |
| `HIGH_ATTENTION` | `ELEVATED_ACTIVITY` |
| `EXTREME_ATTENTION` | *(extra granularity beyond the spec's list — kept because "high and still accelerating" is measurably distinct from "high and stable")* |
| `COOLING` | `DECELERATING` |
| `UNKNOWN` | `INSUFFICIENT_DATA` |

## The exact formula (fully exposed, not hidden)

All of this lives in `computeAttention(social, news)`
(`packages/core/src/attention/attention-engine.ts`), a pure function of two
already-computed summaries — no I/O, no new provider call.

1. **Usable channels.** `usableChannels` = how many of {social, news} have
   a usable (`AVAILABLE`/`PARTIAL`) `dataState`. If zero, the function
   returns immediately: `{ score: null, state: UNKNOWN, quality: UNKNOWN,
   confirmation: UNKNOWN }` — never a guessed classification from no data.
2. **Activity level.** `postCount` (social) and `storyCount` (news,
   distinct stories, not raw articles — see docs/SOCIAL_NEWS_INTELLIGENCE.md)
   feed a "high level" threshold: `postCount >= 200` or `storyCount >= 10`
   (`HIGH_POST_COUNT`, `HIGH_STORY_COUNT` — both named constants in the
   source, not magic numbers).
3. **Acceleration.** `accelerationPct` is recovered algebraically from
   `social.mentionVelocity` and `social.mentionVelocityChange` (both
   already computed by `social-analyzer.ts` from real, timestamped
   observations across two scans — never re-derived from raw posts here).
   `>= 50%` counts as "strong acceleration"; `<= -50%` as "strong cooling."
   `undefined` when there's no previous scan to compare against — never
   defaulted to 0% (a true "no change" is a real `0`, not the same as
   "unmeasured").
4. **State selection**, in this exact priority order: no activity at all →
   `QUIET`; strong cooling → `COOLING`; high level *and* strongly
   accelerating → `EXTREME_ATTENTION`; high level alone → `HIGH_ATTENTION`;
   strongly accelerating alone → `ACCELERATING`; otherwise → `EMERGING`.
5. **Score** (0-100, only computed when `usableChannels >= 1`):
   `round((normalizedPosts * 0.5 + normalizedStories * 0.3 + accelerationBoost * 0.2) * 100)`,
   where `normalizedPosts = min(postCount / 200, 1)`,
   `normalizedStories = min(storyCount / 10, 1)`, and
   `accelerationBoost = max(0, min(accelerationPct / 100, 1))`. The 0.5 /
   0.3 / 0.2 weights are literal constants in the source — nothing here is
   tuned against real traffic (none was available; see "Live verification
   status" below), and this score is presented as exactly what it is: a
   documented, reproducible combination of measured counts, not a
   calibrated prediction.
6. **`quality`** (Confidence): `MEDIUM` when both channels are usable,
   `LOW` when only one is — never `HIGH`, matching the same "never HIGH
   from one weak source" rule used throughout §7/§9.
7. **`confirmation`**: `UNKNOWN` when fewer than two channels are usable
   (nothing to cross-confirm against); otherwise `MEDIUM` when social and
   news activity presence agree (`(postCount > 0) === (storyCount > 0)`),
   `LOW` when they disagree.

## Components exposed (`AttentionComponents`)

`mentionVelocity`, `mentionAcceleration`, `uniqueAuthorGrowth` (typed, not
currently populated — no source computes it yet, left `undefined` rather
than fabricated), `engagementVelocity` (`totalEngagement / postCount`,
`undefined` when `postCount` is 0 or unset — never a divide-by-zero),
`newsCoverageVelocity`, and `socialNewsConvergence` (`1` when both
channels' activity-presence agree, `0` when they don't, `undefined` unless
both channels are usable).

## What feeds this, and what this feeds

Upstream: `SocialSummary`/`NewsSummary`
(docs/SOCIAL_NEWS_INTELLIGENCE.md), themselves built from real
`GdeltNewsClient`/`XSocialClient` observations. Downstream:
`docs/CROSS_SOURCE_INTELLIGENCE.md`'s `ATTENTION_LIQUIDITY_DIVERGENCE`/
`ATTENTION_ACTIVITY_ALIGNMENT` relationships read `hype.state` directly
(never re-deriving it), and `IntegratedInterpretation.whatChanged`
(docs/CROSS_SOURCE_INTELLIGENCE.md §Integrated Interpretation) restates
`hype.state`/`hype.score` verbatim.

## Live verification status

Formula logic is exercised by `packages/core/test/attention-engine.test.ts`
(9 tests, fixture-based) covering every state-selection branch, the
zero-channel `UNKNOWN` path, and the acceleration edge cases (no previous
scan, exactly at the 50% threshold, negative velocity). End-to-end against
a real running API and the real USDG token
(docs/LIVE_VERIFICATION.md's Final Intelligence Completion section): with
neither social nor news reachable from this sandbox, `hype.state ===
"UNKNOWN"` and `hype.score === null` — the honest, correct output when zero
channels are usable, not a fabricated classification.
