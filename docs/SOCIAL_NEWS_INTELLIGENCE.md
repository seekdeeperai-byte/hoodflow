# HOODFLOW — Social + News Intelligence

Status: **IMPLEMENTED** (real provider clients, real normalization, real
analyzers, wired end-to-end into `HoodflowReport`). **NOT LIVE-VERIFIED**
from this build environment — see "Live verification status" below. Added
in the Final Intelligence Completion phase (2026-09-15), governing spec
§3-4. This is additive: no existing type, engine, or route was replaced —
see docs/ARCHITECTURE.md §4 for how this slots into the existing pipeline.

## Why these two providers

Both were chosen specifically because they don't require a product-owner
credential decision to exist as real, working code (§18's "real clients
where possible" directive), while still being pluggable — either can be
swapped or supplemented by a second client behind the same normalized
shape without touching anything downstream.

- **News: GDELT DOC 2.0 API** (`packages/providers/src/news/client.ts`,
  `GdeltNewsClient`) — `GET https://api.gdeltproject.org/api/v2/doc/doc`.
  Public, free, no API key required, no rate-limit tier decision needed.
  A licensed/paid news feed (NewsAPI.org, etc.) remains a legitimate future
  addition (docs/ROADMAP.md), implemented as a second client behind the
  same `NewsObservation` shape — GDELT is not presented as the only
  possible news source, just the one that needed no external decision to
  build now.
- **Social: X (Twitter) API v2 recent search** (`packages/providers/src/social/client.ts`,
  `XSocialClient`) — `GET https://api.twitter.com/2/tweets/search/recent`.
  The most-documented, canonical public social API for this kind of query.
  Under X's current API terms this endpoint requires a paid Bearer token —
  `XSocialClient` is real client code, not a stub, but it checks
  `X_BEARER_TOKEN` **before making any network call** and returns
  `PROVIDER_UNAVAILABLE` immediately when it's unset, exactly per §18
  ("never fake provider implementations... explicit PROVIDER_UNAVAILABLE
  when credentials unavailable"). No other social source (Reddit,
  Telegram) was implemented this phase — same reasoning as
  docs/ROADMAP.md's prior note: each needs its own account/app-registration
  decision from whoever owns production credentials, not something to
  invent here.

## Normalized shapes

Both providers normalize into types defined once in
`packages/core/src/types/social-news.ts`, reusing `DataState` unchanged —
no parallel availability enum was invented:

- **`SocialObservation`** — `source`, `observedAt` (the post's own
  timestamp, never fetch time), `authorId`/`authorHandle`, `text` (kept as
  opaque untrusted content — see "Security" below),
  `officialClassification` (`OFFICIAL | UNOFFICIAL | UNKNOWN`, never
  inferred from a verification badge alone), `engagementCount`,
  `entityMatch`, `sourceQuality`. Every optional numeric/string field is
  `undefined`, never `0`/`""`, when the provider didn't supply it.
- **`NewsObservation`** — `source` (publisher domain), `title`,
  `publishedAt`, `entityMatch`, `sourceQuality`, and a deterministic
  `category` (`ANNOUNCEMENT | MARKET_COVERAGE | REGULATORY | GENERAL |
  UNKNOWN`) — see "Deterministic classification" below.

## Entity resolution (§10)

Every observation carries an `EntityMatch` (`packages/core/src/identity/resolve-entity-mention.ts`,
`resolveEntityMention()`), reusing the exact "contract address beats
symbol" principle already established in
`packages/core/src/identity/resolve-identity.ts` and its real GME
naming-collision case study (docs/IDENTITY_RESOLUTION.md):

1. `CONTRACT_ADDRESS` — the observation's text contains the literal
   contract address. Strongest possible match.
2. `OFFICIAL_NAME` — the text contains the token's known official name.
3. `SYMBOL_UNAMBIGUOUS` — the text contains the symbol, and that symbol
   isn't ambiguous against the chain's other `knownTokens` entries.
4. `SYMBOL_AMBIGUOUS` — the symbol matches, but so would at least one
   other known token on the same chain (e.g. a common ticker); flagged
   explicitly rather than silently picked.
5. `NO_MATCH` — nothing matched; the observation is dropped by the
   analyzers rather than attributed to the wrong entity.

A false match is treated as strictly worse than a missing observation
(governing spec §10) — `SYMBOL_AMBIGUOUS`/`NO_MATCH` observations are
excluded from `SocialSummary`/`NewsSummary` counts rather than silently
counted as real coverage. See `packages/core/test/resolve-entity-mention.test.ts`
(9 tests) for the ambiguous-ticker regression case.

## Source quality (§9)

`SourceQuality` (`OFFICIAL | ESTABLISHED_PUBLISHER | PUBLIC_SOCIAL |
UNKNOWN_SOURCE`) is assigned per-observation
(`packages/providers/src/news/normalize.ts::sourceQualityFor()` for news;
X posts are always `PUBLIC_SOCIAL` or `OFFICIAL` when
`officialClassification === "OFFICIAL"`, never `ESTABLISHED_PUBLISHER`,
since a social post is never a publisher). News stories are grouped by
`groupNewsStories()` (`packages/core/src/news/news-analyzer.ts`) before
counting, so ten syndicated copies of the same wire story count as one
`NewsStoryGroup`, not ten independent confirmations — this is what
`NewsSummary.storyCount` (distinct stories) vs. `articleCount` (raw count,
including duplicates) actually measures, and it's the reason
`SOCIAL_NEWS_ALIGNMENT`/`MULTI_SOURCE_CONVERGENCE` (docs/CROSS_SOURCE_INTELLIGENCE.md)
compare against `storyCount`, never `articleCount`.

## Deterministic classification, not LLM sentiment (§4)

`classifyCategory()` (`packages/providers/src/news/normalize.ts`) assigns
`NewsObservation.category` from keyword/structure matching against the
title only (e.g. "announces"/"launches" → `ANNOUNCEMENT`;
"SEC"/"regulator"/"lawsuit" → `REGULATORY`) — never an LLM call, and never
presented as sentiment. There is no LLM anywhere in this pipeline (see
docs/SECURITY.md's "No LLM in the pipeline" note) — every classification
in `social-analyzer.ts`/`news-analyzer.ts`/`attention-engine.ts` is a plain
deterministic function over already-validated fields.

## Velocity, and what "previous scan" means here

`SocialSummary.mentionVelocity` (posts/hour over the observation window)
and `mentionVelocityChange` (delta vs. the *previous scan's* summary, only
when one exists) are computed in `analyzeSocial()`
(`packages/core/src/social/social-analyzer.ts`). Both are `undefined`,
never `0`, when the window or post count can't be established — an
`undefined` velocity means "not measured," not "measured at zero."
`NewsSummary.coverageVelocity` follows the same pattern for distinct
stories/hour. These feed `attention-engine.ts` directly (docs/HYPE_ATTENTION.md)
and are the same values compared, unmodified, in cross-source relationship
evidence (docs/CROSS_SOURCE_INTELLIGENCE.md).

## Data availability

`HoodflowReport.social`/`.news` each carry their own `state: DataState`,
independent of every other domain — a social provider failure never
affects `news`, `dataQuality.holders`, `marketState`, or vice versa.
`snapshot.social`/`snapshot.news` are optional on `TokenSnapshot`
(`packages/core/src/types/domain.ts`); when the pipeline doesn't wire a
provider at all (`PipelineDeps.social`/`.news` left `undefined`), the
fallback is `DATA_UNAVAILABLE` with an explanatory message — the same
"not configured for this build" convention DexScreener's slug-gate and
Blockscout's chain-gate already use, not the credential-specific
`PROVIDER_UNAVAILABLE` (reserved for `XSocialClient`'s own missing-token
check, where a client exists but can't run). "No news this window" and
"no social posts this window" are both real, informative zeros
(`AVAILABLE` with `postCount: 0` / `storyCount: 0`) — never conflated with
either unavailable state; see `packages/core/test/social-analyzer.test.ts`
and `.../news-analyzer.test.ts` for the explicit regression tests
distinguishing "zero, measured" from "unmeasured."

## Security

`text`/`title` fields are untrusted external content end to end: `packages/core`
never interprets them as instructions (no field on `SocialObservation`/
`NewsObservation` is ever passed to an LLM, a template evaluator, or any
code-execution path — there is no LLM in this pipeline at all), and
`apps/web`'s `SocialIntelligence.tsx`/`NewsIntelligence.tsx` render them as
plain React children (default JSX escaping, never
`dangerouslySetInnerHTML`). See docs/SECURITY.md's "Prompt Injection
Resistance" section for the end-to-end regression test that feeds a
hostile "IGNORE ALL PREVIOUS INSTRUCTIONS... `<script>`" string through the
real pipeline and asserts it never changes `marketState`, `score`, or
appears unescaped anywhere in the response.

## Live verification status

**NOT LIVE-VERIFIED.** This sandbox's egress policy blocks arbitrary
third-party hosts at the proxy's CONNECT layer — the same constraint
documented since Phase 0 for GoPlus/DexScreener/Blockscout
(docs/ARCHITECTURE.md §2) — and `api.gdeltproject.org`/`api.twitter.com`
were confirmed to be blocked the identical way this phase (direct `curl -v`
against the proxy showed the `403` originates at the proxy, before
reaching either real host; see docs/LIVE_VERIFICATION.md's Final
Intelligence Completion section for the exact evidence). `X_BEARER_TOKEN`
is also not configured in this environment, so `XSocialClient` would
report `PROVIDER_UNAVAILABLE` even if the network path were open.
`scripts/verify-live-providers.ts` now also calls both new clients and
prints the same structured report format used for the three existing
providers — this is the reproducible way to close this gap from an
environment with real egress and (for X) a funded Bearer token.
