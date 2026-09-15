# HOODFLOW — Identity Resolution (Phase 5)

Status: implemented and tested, 2026-09-15. This is the layer that answers
"what exact asset is HOODFLOW analyzing?" before name/symbol context is
interpreted — see the layered pipeline in `docs/ARCHITECTURE.md` §4, which
this phase inserts an `Identity` stage into, between Normalization and the
Signal Engine.

## The rule everything here follows

**CHAIN + CONTRACT ADDRESS is authoritative. Name, symbol, and alias are
contextual evidence — never permitted to override a contract-address
conclusion.** Every design decision below traces back to this one rule.

## Why this phase exists (real finding, not a hypothetical)

Phase 4's live research (`docs/LIVE_VERIFICATION.md`) found a genuine
naming-collision risk on Robinhood Chain: an official-ish GME stock token
(address independently confirmed live via DexScreener) and a
separately-existing `gme.meme` memecoin that also uses the GME name/ticker.
`docs.robinhood.com/chain/contracts` itself warns: *"a token with a
matching name/ticker but a different contract address is not a Robinhood
Stock Token."*

Before this phase, HOODFLOW's known-token registry (`KnownToken[]` in
`packages/providers/src/chains.ts`) already had the provenance tiers to
represent this (`official_docs` / `live_confirmed_third_party` /
`unconfirmed_third_party`) — but nothing downstream ever read it. A report
for either GME address would say nothing about the collision at all. That
gap is what Phase 5 closes.

## Architecture

```
Provider results (already fetched: GoPlus / DexScreener / Blockscout)
   -> gather ProviderObservedIdentity[]     [apps/api/src/pipeline.ts]
   -> resolveIdentity()                     [packages/core/src/identity/resolve-identity.ts]
   -> IdentityResolution                    [packages/core/src/types/identity.ts]
   -> analyzeIdentity()                     [packages/core/src/analyzers/identity-analyzer.ts]
   -> Signal[] (source: "identity")
   -> HoodflowReport.identity + .signals    [packages/core/src/report/build-report.ts]
```

`resolveIdentity` is a pure function — no I/O, same shape as every other
analyzer — that takes one chain's already-fetched known-token list and a
small set of provider-observed name/symbol values, and returns a single,
deterministic `IdentityResolution`. It never makes a network call; nothing
about it introduces a new SSRF surface (see "Security" below).

### Why `KnownToken` moved into `@hoodflow/core`

`packages/core` has zero dependency on `packages/providers` (providers
depends on core, never the reverse — `packages/core` is described in
`docs/ARCHITECTURE.md` as "pure intelligence engine, zero I/O"). The
identity resolver needs the known-token registry's shape as an input type,
so `KnownToken` now lives in `packages/core/src/types/identity.ts` and
`packages/providers/src/chains.ts` imports and re-exports it. This keeps a
single registry model instead of two parallel ones (Rule 2 of the Phase 5
spec: reuse existing architecture, don't duplicate).

`ChainConfig` itself (provider base URLs, verification flags) stays in
`packages/providers` — it's genuinely provider/I-O-specific, unlike
`KnownToken`, which is pure identity data.

### Where provider-observed name/symbol comes from

GoPlus (`token_name`/`token_symbol`), DexScreener (`baseToken.name`/
`.symbol`), and Blockscout (`token.name`/`.symbol`) were all already
parsed by each provider's zod schema in Phase 0–4 — they just weren't
surfaced into the normalized domain types. Phase 5 adds
`observedName`/`observedSymbol` to `ContractSecurityData`,
`LiquiditySnapshot`, and `HolderSummary` (one optional field pair per
type, sourced from data each provider was already returning) rather than
inventing a new provider-identity side channel. `apps/api/src/pipeline.ts`
gathers these into `ProviderObservedIdentity[]` only from domains that came
back usable — a provider that returned nothing usable contributes nothing.

## Matching priority

1. **Normalized contract address, exact match against the registry.**
   Authoritative. If found, this address's identity is settled — symbol/
   name/alias are never consulted to change it, only to detect a
   disagreement or a collision alongside it.
2. When there is **no exact address match**, provider-observed name/symbol
   context is checked against *other* registry entries' symbol/alias.
   This never assigns the queried address someone else's identity — it
   only classifies the situation as AMBIGUOUS (context overlaps 2+ known
   addresses) or CONFLICTING (context points at exactly one different,
   specific known address).
3. Chain-mismatch is invalidated **by construction**, not by an extra
   check: `resolveIdentity` always receives one chain's `knownTokens`
   already scoped by the caller (`getChainConfig(chainId)?.knownTokens`),
   so an address that happens to match a *different* chain's registry can
   never be found — that chain's entries were never in scope.

Fuzzy/contextual matching beyond exact-string symbol/alias comparison is
**not implemented** — the Phase 5 spec permits it "only if already
supported and safe," and nothing in this codebase does fuzzy matching
anywhere else, so adding it here would be a new, unproven abstraction.

## Identity status

| Status | Meaning |
|---|---|
| `CONFIRMED` | Exact registry match for this address, and provider-observed data (if any) agrees. |
| `CONFLICTING` | Either (a) an exact match exists but provider-observed symbol disagrees with it, or (b) no exact match exists but context points at exactly one different, specific known address. |
| `AMBIGUOUS` | No exact match; context overlaps 2+ distinct known addresses — genuinely can't tell which, if any. |
| `UNVERIFIED` | No exact match, no overlapping context either. **Not a negative finding** — the registry is small and manually curated; most legitimate tokens simply aren't in it yet. |
| `UNAVAILABLE` | Resolution couldn't run at all (malformed address reaching the resolver directly). In production this path is defensive-only — the route already rejects malformed addresses before `resolveIdentity` is ever called. |

`IdentityStatus` is a new small enum, not a reuse of `DataState` — `DataState`
models provider-fetch outcomes (AVAILABLE/PROVIDER_UNAVAILABLE/etc.), and
identity resolution is a deterministic computation over already-fetched
data, not a fetch of its own. The Phase 5 spec explicitly allows
introducing a new state set when `DataState` doesn't already fit; here it
doesn't (there's no "AMBIGUOUS" or "CONFLICTING" concept in `DataState`).

## Identity confidence

Reuses the existing 3-tier `Confidence` (`LOW`/`MEDIUM`/`HIGH`) rather than
introducing a parallel 5-tier model, per the Phase 5 spec's own permission
("use existing repository conventions if they already provide an
equivalent model"):

| Registry entry's `source` | Confidence when `CONFIRMED` |
|---|---|
| `official_docs` | HIGH |
| `live_confirmed_third_party` | MEDIUM |
| `unconfirmed_third_party` | LOW |
| `test_fixture` (never in a real registry) | LOW |

`confidence` is `null` whenever `status` is `UNVERIFIED`/`UNAVAILABLE` —
there is no conclusion to be confident about, so nothing is fabricated
into a numeric-feeling tier. This is identity confidence specifically:
*confidence that the supplied contract corresponds to the identified
project/asset metadata* — never trading confidence, never a risk score.

## Signals

`analyzeIdentity()` emits at most one "primary status" signal per
resolution (chosen by specificity, not by piling on every technically-true
signal), plus `IDENTITY_COLLISION` independently whenever
`conflicts.length > 0` — "this address's own identity is fine" and "a
lookalike exists elsewhere on this chain" are genuinely separate, both-useful
facts that can co-occur.

| Signal | Fires when |
|---|---|
| `OFFICIAL_IDENTITY_MATCH` | `CONFIRMED` + `source: official_docs` |
| `IDENTITY_CONFIRMED` | `CONFIRMED` + `source: live_confirmed_third_party` |
| `NON_OFFICIAL_IDENTITY_CONTEXT` | `CONFIRMED` + `source: unconfirmed_third_party`/`test_fixture` — deliberately not "confirmed" language, since the registry entry's own provenance is weak |
| `IDENTITY_MISMATCH` | `CONFLICTING` |
| `IDENTITY_AMBIGUITY` | `AMBIGUOUS` |
| `IDENTITY_UNVERIFIED` | `UNVERIFIED` |
| `IDENTITY_COLLISION` | `conflicts.length > 0`, independent of status |

All identity-signal evidence text is factual and neutral (e.g. "A shared
symbol never confirms these are the same asset") — never a verdict word.
`packages/core/test/identity-analyzer.test.ts` has a regression test
specifically asserting no affirmative accusation ever appears.

## Report/API surface

`HoodflowReport` gained one new top-level field:

```
identity: {
  chainId, contractAddress, status, confidence,
  match: { source, address, symbol, name?, note } | null,
  conflicts: [{ description, conflictingAddress, conflictingSymbol?, conflictingSource? }],
  providerObserved: [{ provider, name?, symbol? }],
  observedAt,
}
```

`token.name`/`token.symbol` (fields that existed on `TokenIdentity` since
Phase 0 but were never populated) are now set — but **only** when
`identity.status === CONFIRMED`, using the registry match's own
name/symbol. They are never populated from unverified provider claims,
which is the direct, concrete expression of Rule 4 ("contract address is
authoritative, name/symbol contextual") at the API boundary.

## Score integrity — no change

**HOODFLOW Score changed: NO.**

`score.dataQualityScore` is unchanged — it still measures only
contract/liquidity/holders provider availability (see
`packages/core/src/report/build-report.ts::dataQualityScore`), exactly as
in Phase 0–4. Identity signals are deliberately excluded from
`detectRelationships()`/`buildEvidence()`'s input (they're appended to
`signals` *after* relationships/evidence/marketState are already computed)
so they can never influence `marketState` either.

One near-miss worth documenting: an early version of this phase's
`build-report.ts` change computed `dataQuality.overallConfidencePenalty`
*after* identity limitations were already pushed into the same
`limitations` array used for that calculation — which would have silently
made `overallConfidencePenalty` more pessimistic for the (very common)
`UNVERIFIED` case, an unintended de facto score change. Caught before
shipping: `marketLimitationsCount` is now captured *before* any identity
limitation is considered, so `overallConfidencePenalty`'s semantics are
byte-for-byte unchanged from Phase 0–4. See the code comment at that exact
line in `build-report.ts`.

Identity limitation strings still appear in the report's `limitations[]`
array for transparency (a user should be told why identity is
unresolved) — they just don't feed the score/penalty math.

## Historical identity — no HistoryStore changes needed

The Phase 5 spec asks for the architecture to be "future-compatible with
CURRENT IDENTITY vs PREVIOUSLY OBSERVED IDENTITY" without building
persistence now. `HistoryStore.ScanRecord` (`packages/core/src/history/
history-store.ts`) already stores the full `TokenSnapshot` and
`HoodflowReport` per scan — both of which now include `identity` — so a
future "did this token's identity resolution change since last scan?"
feature needs zero changes to `HistoryStore`/`InMemoryHistoryStore`. This
was a deliberate no-change decision, not an oversight.

## The GME regression fixture — and why it uses a synthetic address

Phase 5's research pass attempted to find the real `gme.meme` memecoin's
contract address (WebSearch located the project's existence — `gme.meme`,
various explainer articles — but not a literal on-chain address in the
returned snippets; a follow-up `WebFetch` to read the site directly hit
this session's rate limit). Per the "never fabricate identity" rule, this
codebase does **not** guess that address and add it to the real
`CHAINS` registry in `packages/providers/src/chains.ts`.

Instead, `KnownToken.source` gained a fourth value, `"test_fixture"`,
reserved for synthetic regression addresses that must never appear in a
real chain registry (enforced by a regression test in
`packages/providers/test/chains.test.ts` that asserts no real registry
entry uses it). `packages/core/test/resolve-identity.test.ts` builds a
local, clearly-labeled two-GME fixture (the real registry address plus one
synthetic `test_fixture` address) and proves, against the real structural
shape of the Phase 4 finding:

1. both GME identities can coexist in a registry without error,
2. contract + chain always wins — querying either address returns *that*
   address's own identity, never the other's, even when both have
   identical provider-observed name/symbol context,
3. the collision is detected in both directions,
4. an unrelated third address whose provider metadata merely *claims*
   "GME" resolves to `AMBIGUOUS`, never a guess,
5. none of the generated evidence text makes an accusation.

The real `gme.meme` address remains an open item — tracked here and in
`docs/LIVE_VERIFICATION.md`'s "what's still open" list — for whoever next
has working `WebFetch`/live network access to resolve.

## Security review (Phase 5-specific)

- **No new SSRF/URL surface.** `resolveIdentity` is pure computation over
  already-fetched data — it builds no URL and makes no network call.
- **Input validation unchanged, reused.** `chainId`/`address` are
  validated by the existing zod `ParamsSchema` and
  `isValidEvmAddress()`/`normalizeEvmAddress()` (`packages/providers/src/
  validate.ts`) before `fetchSnapshot`/`resolveIdentity` ever run — mixed
  case, whitespace, oversized input, and malformed hex are all already
  rejected there. `resolveIdentity` additionally re-validates the address
  with its own copy of the same regex as a defensive check for direct/unit
  callers (documented in-code as intentionally duplicated, not shared,
  because `packages/core` cannot depend on `packages/providers`).
- **Registry is compile-time data, not a runtime-writable store.** `CHAINS`
  in `chains.ts` is a hardcoded TypeScript literal; no route or provider
  response ever writes to it. "Malicious registry ingestion" isn't a live
  attack surface here — the applicable risk is a data-entry bug (e.g. two
  real entries accidentally sharing an address), which
  `packages/providers/test/chains.test.ts` now has a standing regression
  test for.
- **No new DoS surface.** `resolveIdentity` is O(knownTokens.length) per
  request; the registry currently holds 0–3 entries per chain. Even at a
  few hundred entries this is trivial CPU, and the existing global rate
  limiter (`@fastify/rate-limit`, unchanged) still bounds request volume.
- **No new logging/secret-leakage surface.** The route still logs only
  `{chainId, addressPrefix}` (unchanged); identity/provider-observed
  strings flow into the JSON response body and into `pino`'s structured
  logger only as ordinary string field values, the same way `evidence`
  strings already did in Phase 0–4 — no raw string interpolation, no new
  code path that could concatenate untrusted content into a log line or a
  URL.

## What Phase 5 deliberately did not build

Per the spec's own "do not solve future-phase problems" boundary:

- No fuzzy/similarity matching beyond exact symbol/alias comparison.
- No PostgreSQL-backed identity history (the existing `HistoryStore`
  already carries it for free — see above).
- No change to `marketState`, `score.dataQualityScore`, or any existing
  `RelationshipType` — identity risk stays conceptually separate from
  contract/market risk, per the spec's own instruction. Identity was
  specifically *not* wired into `detectRelationships()`/`buildEvidence()`'s
  market-signal contradiction sweep, even though it would have been easy
  to do so, because that sweep exists to relate market signals to each
  other, not to fold in an unrelated risk dimension.
- No resolution of the real `gme.meme` address (network-blocked this
  phase too — see above).
