# HOODFLOW — Data Contract Audit

Phase 4 deliverable (spec section 5). Field-by-field audit of every value
that crosses a provider boundary and lands in a normalized domain type. The
goal: for every field a downstream signal/interpretation can read, know
exactly what it means when present, what it means when absent, and what
guarantees the zod schema actually gives — so nothing downstream can
mistake "we don't know" for "we checked and it's false/zero."

Conventions used below:
- **Raw wire type** — what the schema currently accepts (post-`safeParse`).
- **Optional?** — whether the field can legitimately be absent on a
  successful, schema-valid response (not the same as "the provider is
  down" — that's a whole different `DataState`).
- **Absent means** — what `undefined`/`null` means for this specific field.
  This is the row that matters most: a field where "absent" quietly meant
  "false" would be exactly the fabrication bug this project exists to
  prevent.
- **Normalization** — any transform applied (string→number, "0"/"1"→bool,
  fraction→percent, timestamp shape, etc).
- **Verified how** — UNIT (schema/normalizer has a passing test with a
  representative payload) vs. LIVE (the specific field was seen in a real
  response captured during Phase 4 — see docs/LIVE_VERIFICATION.md) vs.
  DOCS-ONLY (schema follows published API docs; no live or unit
  confirmation of this specific field's real-world shape yet).

## GoPlus Token Security → `ContractSecurityData`

Source: `packages/providers/src/goplus/schema.ts` + `normalize.ts`.
Every GoPlus field is optional in the wire schema — GoPlus omits fields it
has no answer for rather than sending `null` or `false`, so "absent" is
uniformly "GoPlus did not report on this," never "GoPlus checked and the
answer is no."

| Field (normalized) | Raw wire field | Raw type | Optional? | Absent means | Normalization | Verified how |
|---|---|---|---|---|---|---|
| `isOpenSource` | `is_open_source` | `"0"\|"1"` | yes | unknown, not "closed source" | `"1"` → `true` | UNIT |
| `isProxy` | `is_proxy` | `"0"\|"1"` | yes | unknown | `"1"` → `true` | UNIT |
| `isUpgradeable` | *(derived from `is_proxy`)* | — | yes | unknown | GoPlus has no separate upgradeability flag; we alias it to `isProxy` and say so in code — this is a modeling choice, not a GoPlus field, and is documented inline as such | N/A — derived |
| `ownerAddress` | `owner_address` | string | yes | unknown owner (could be renounced, or GoPlus just didn't resolve it — these are NOT distinguished) | passthrough, `??null` | UNIT |
| `canTakeBackOwnership` | `can_take_back_ownership` | `"0"\|"1"` | yes | unknown | `"1"` → `true` | UNIT |
| `hiddenOwner` | `hidden_owner` | `"0"\|"1"` | yes | unknown | `"1"` → `true` | UNIT |
| `isMintable` | `is_mintable` | `"0"\|"1"` | yes | unknown | `"1"` → `true` | LIVE (USDG, false) |
| `isHoneypot` | `is_honeypot` | `"0"\|"1"` | yes | unknown | `"1"` → `true` | UNIT |
| `isBlacklisted` | `is_blacklisted` | `"0"\|"1"` | yes | unknown | `"1"` → `true` | UNIT |
| `isWhitelisted` | `is_whitelisted` | `"0"\|"1"` | yes | unknown | `"1"` → `true` | UNIT |
| `isAntiWhale` | `is_anti_whale` | `"0"\|"1"` | yes | unknown | `"1"` → `true` | UNIT |
| `canBePaused` / `transferPausable` | `transfer_pausable` | `"0"\|"1"` | yes | unknown | `"1"` → `true` (both fields read the same source; `canBePaused` is a legacy alias kept for report-schema compatibility) | UNIT |
| `tradingCooldown` | `trading_cooldown` | `"0"\|"1"` | yes | unknown | `"1"` → `true` | UNIT |
| `buyTaxPct` | `buy_tax` | numeric string, **including `""`** | yes | unknown (only if the field is truly absent — see next column) | `""` is explicitly mapped to `0`, not treated as absent — this is the Phase 4 live-discovered quirk (see below); a real absent value (`undefined`) stays `undefined`; otherwise `Number(v) * 100` | LIVE (USDG returned `""`, confirmed 0%) |
| `sellTaxPct` | `sell_tax` | numeric string, **including `""`** | yes | same as `buyTaxPct` | same as `buyTaxPct` | LIVE (USDG returned `""`) |
| `holderCount` | `holder_count` | numeric string | yes | unknown, not zero | `Number(v)`, `NaN`→`undefined` | LIVE (USDG: 341,809) |
| `top10HolderPct` | *(derived)* `holders[]` | array | yes (empty/absent array → `undefined`) | GoPlus's own holder list is empty/absent for this token, not "no concentration" | sorted desc by `percent`, top-10 summed, ×100 | UNIT |
| `lpHolderCount` | `lp_holder_count` | numeric string | yes | unknown | `Number(v)` | UNIT |
| `creatorAddress` | `creator_address` | string | yes | unknown | passthrough, `??null` | UNIT |
| `creatorBalancePct` | `creator_percent` | numeric string, may be `""` | yes | same empty-string handling as tax fields | `pctFraction()` | UNIT |

**Fields received on the wire but intentionally NOT normalized/exposed:**
`token_name`, `token_symbol`, `total_supply`, `lp_total_supply`,
`selfdestruct`, `external_call`, `slippage_modifiable`,
`personal_slippage_modifiable` — parsed (so an unexpected shape doesn't
fail validation) but not yet mapped into `ContractSecurityData`. Not a
data-integrity issue (nothing here fabricates them as false), just an
acknowledged product-scope gap: `selfdestruct` and `external_call` in
particular are risk-relevant and are flagged in `docs/ROADMAP.md`-adjacent
follow-up, not silently dropped without a trace.

**Live-discovered quirk locked in by this audit:** `buy_tax`/`sell_tax`
arrive as the literal empty string `""` for untaxed tokens on Robinhood
Chain (confirmed against USDG), not `"0"` and not an absent field.
`Number("")` evaluates to `0` in JS, which happens to be the right answer,
but the normalizer makes this explicit (`if (v === "") return 0;`) rather
than relying on an implicit coercion accident, and a regression test locks
in the distinction between `""` (→ 0, confirmed no tax) and a truly absent
field (→ `undefined`, unknown).

## DexScreener pairs → `LiquiditySnapshot`

Source: `packages/providers/src/dexscreener/schema.ts` + `normalize.ts`.
DexScreener's own docs describe every numeric field here as
best-effort/omittable for thin or brand-new pairs, so the schema mirrors
that: everything below `baseToken.address` is optional.

| Field (normalized) | Raw wire field | Raw type | Optional? | Absent means | Normalization | Verified how |
|---|---|---|---|---|---|---|
| `dexId` | `dexId` | string | yes | unknown DEX | passthrough | LIVE (GME/WETH pair) |
| `pairAddress` | `pairAddress` | string | yes | unknown pair address | passthrough | LIVE |
| `priceUsd` | `priceUsd` | numeric string | yes | price not reported for this pair right now | `Number(v)` | LIVE |
| `liquidityUsd` | `liquidity.usd` | number | yes | liquidity not reported — **not** zero liquidity | passthrough | LIVE |
| `fdvUsd` | `fdv` | number | yes | unknown FDV | passthrough | LIVE |
| `marketCapUsd` | `marketCap` | number | yes | unknown market cap (distinct from FDV; DexScreener sends both when it can compute them) | passthrough | LIVE |
| `volumeUsd24h` | `volume.h24` | number | yes | no 24h volume reported — for a brand-new pair this can legitimately mean "too new to have a full 24h window," not "zero trading" | passthrough | LIVE |
| `priceChangePct24h` | `priceChange.h24` | number | yes | unknown | passthrough | UNIT |
| `buys24h` | `txns.h24.buys` | number | yes | unknown tx count, not zero | passthrough | LIVE |
| `sells24h` | `txns.h24.sells` | number | yes | unknown tx count, not zero | passthrough | LIVE |
| `pairCreatedAt` | `pairCreatedAt` | number (unix ms) | yes | unknown pair creation time | `new Date(v).toISOString()` | UNIT |

**Pair selection:** when a token has multiple pairs, `pickPrimaryPair()`
picks the one with the highest `liquidity.usd` (treating a missing value
as `0` for *ranking purposes only* — this does not leak into the
normalized `liquidityUsd` field itself, which stays `undefined` if that's
what the chosen pair actually reports). This is a real design decision
worth flagging: a token with several shallow pairs and no clearly dominant
one will have its "primary pair" choice change run-to-run as liquidity
shifts, which is expected and not a bug, but is not yet surfaced to the
report consumer as "multiple comparable pairs exist" — noted as a gap.

**Chain gating (not a field, but part of this contract):** DexScreener is
only ever called for a chain whose `dexScreenerSlugVerified` flag is
`true` in the chain registry. For chain 4663 this flag is now `true`
(slug `"robinhood"`, live-confirmed Phase 4). For any unverified chain
(e.g. testnet 46630) the route never calls DexScreener at all and reports
`DATA_UNAVAILABLE` — this is deliberate: an unverified/wrong slug and "no
pairs exist yet" are indistinguishable from the API's response shape
alone, so guessing a slug risks silently-always-empty data forever.

## Blockscout tokens/holders → `HolderSummary`

Source: `packages/providers/src/blockscout/schema.ts` + `normalize.ts` +
`client.ts`. This is the one provider where LIVE verification is fully
blocked (see docs/LIVE_VERIFICATION.md) — every row below is DOCS-ONLY or
UNIT unless stated otherwise, and that gap is treated as load-bearing: the
real wire shape (especially `decimals` handling and value units) is
unconfirmed on Robinhood Chain specifically.

| Field (normalized) | Raw wire field | Raw type | Optional? | Absent means | Normalization | Verified how |
|---|---|---|---|---|---|---|
| `holderCount` | `holders_count` (token endpoint) | string\|number\|null | yes | unknown holder count, not zero | `Number(v)`; `null`/`undefined` → `undefined` | DOCS-ONLY |
| `top10Pct` | *(derived)* `holders[].value` ÷ `total_supply` | — | yes — requires both `total_supply>0` AND a non-empty holders page | either input missing/zero → `undefined`, never a divide-by-zero or a false `0%` | sum of top-10 balances ÷ total_supply × 100 | DOCS-ONLY |
| `top20Pct` | same inputs, top 20 | — | same gating as `top10Pct` | same | same, top-20 | DOCS-ONLY |

**A field-level nuance worth calling out explicitly:** `total_supply` and
holder `value` are both raw on-chain integer strings (i.e. NOT yet divided
by `10^decimals`). Percentages computed as `sum(values) / total_supply`
are still mathematically correct because both sides of the ratio are in
the same (undivided) unit — decimals cancel out. But this means
`total_supply` and individual holder balances, if ever exposed as
human-readable numbers in a future field, would need explicit `decimals`
division that does not exist yet anywhere in this normalizer. Not a bug
today (no such field is exposed), but flagged so it isn't silently gotten
wrong when one is added.

**Two-request partial-success handling (state, not a field, but part of
this contract):** `getHolderSummary()` makes two calls — `/tokens/{addr}`
then `/tokens/{addr}/holders`. If the token call succeeds but the holders
page fails or is empty, the client still returns `holderCount` (from the
token call) with `state: PARTIAL` rather than discarding it — explicitly
modeled as "we have some of the picture," distinct from `AVAILABLE`
(both calls succeeded) and from `DATA_UNAVAILABLE`/`PROVIDER_UNAVAILABLE`
(neither call produced usable data). `top10Pct`/`top20Pct` are
`undefined` in the `PARTIAL` case since they require the holders page.

**HTTP status handling audited alongside the fields:** 403 →
`PROVIDER_UNAVAILABLE` (blocked, not confirmed-absent — this is the
Phase 4 fix), 404 → `DATA_UNAVAILABLE` (positively not a token contract on
this chain), 429 → `RATE_LIMITED`, 5xx → `PROVIDER_UNAVAILABLE`, other 4xx
→ `ERROR`. A schema-validation failure on either call also becomes
`ERROR`, never a partially-trusted guess at the shape.

**Chain gating (not a field, but part of this contract — Phase 11 fix):**
unlike DexScreener (gated behind `dexScreenerSlugVerified` since Phase 4),
`apps/api/src/pipeline.ts`'s `fetchSnapshot` had no equivalent gate for
Blockscout before Phase 11, even though `BlockscoutClient` is a single
instance scoped to one chain's explorer base URL
(`apps/api/src/server.ts` constructs it for chain 4663 only). Chain 46630
(testnet) is a *registered* chain (it has its own, different
`blockscoutBaseUrl` in `chains.ts`), so a request for
`/v1/report/46630/:address` passed the route's chain-existence check and
reached `fetchSnapshot`, which called the chain-4663-scoped client
regardless — meaning a real mainnet holder-data response for that address
could have been returned and presented as if it belonged to the testnet
chain's report. This is exactly the kind of cross-chain data
misattribution this project's data-integrity rules exist to prevent, and
it was a genuine bug, not a documented limitation, since nothing gated it
and the existing test suite never exercised chain 46630 against a
Blockscout mock returning `AVAILABLE` data. Fixed in Phase 11:
`PipelineDeps` now carries an explicit `blockscoutChainId`, and
`fetchSnapshot` only calls `blockscout.getHolderSummary()` when the
request's `chainId` matches it — otherwise `holders` resolves to
`DATA_UNAVAILABLE` with an explicit explanatory message, the same
fail-closed pattern DexScreener already used. Regression test:
`apps/api/test/report.route.test.ts`, "Phase 11 fix: never calls
Blockscout for a chain other than the one it's configured for."

## Cross-cutting guarantees this audit confirms are actually in place

- **No field, in any of the three normalizers, ever defaults a missing
  numeric/boolean value to `0`/`false`.** Every "absent" case above
  resolves to `undefined` (or, for GoPlus's two address fields, `null` via
  an explicit `?? null`, matching the existing nullable contract on those
  two fields specifically — not a stray inconsistency, verified while
  writing this table). The one place a `""` string is mapped to a real
  `0` (GoPlus tax fields) is deliberate and live-verified, not a defaulting
  bug.
- **Every provider response, valid or not, passes through a zod
  `safeParse` before any field is read.** A response that fails validation
  never reaches a normalizer — it becomes `DataState.ERROR` with the raw
  parse failure logged server-side only (see docs/SECURITY.md, secrets
  handling section, for why nothing about the raw body reaches the HTTP
  client).
- **Every provider client's failure branches were re-audited this phase
  for HTTP-status coverage**, not just schema-validation failure —
  GoPlus and DexScreener were missing an explicit 403 branch before Phase
  4 (see docs/SECURITY.md "New finding, fixed"); Blockscout already had
  one. All three now handle 403/404-or-N/A/429/5xx/other-4xx explicitly
  rather than falling through to a generic catch-all.

## Phase 5 addendum — identity-observed fields

Phase 5 added one field pair to each of the three normalized domain types,
sourced from data each provider was already returning (and already parsed
by that provider's zod schema) but not previously surfaced:

| Field | Source | Optional? | Absent means | Verified how |
|---|---|---|---|---|
| `ContractSecurityData.observedName`/`.observedSymbol` | GoPlus `token_name`/`token_symbol` | yes | GoPlus did not report a name/symbol for this address | LIVE (USDG: "Global Dollar"/"USDG", see docs/LIVE_VERIFICATION.md) |
| `LiquiditySnapshot.observedName`/`.observedSymbol` | DexScreener `baseToken.name`/`.symbol` | yes | not reported for this pair | UNIT (schema already modeled these as optional; not independently re-verified live this phase) |
| `HolderSummary.observedName`/`.observedSymbol` | Blockscout `token.name`/`.symbol` | yes | not reported; Blockscout sends `string \| null`, normalized to `undefined` — never an empty string or `null` placeholder | DOCS-ONLY (Blockscout remains network-blocked — see docs/LIVE_VERIFICATION.md; a regression test confirms the `null`→`undefined` normalization specifically, packages/providers/test/blockscout.test.ts) |

These fields are explicitly **contextual identity evidence only** — see
docs/IDENTITY_RESOLUTION.md. Nothing in the identity resolver, or anywhere
else, treats them as authoritative on their own; they are cross-checked
against the known-token registry, never substituted for a contract-address
match.

## Phase 9 addendum — audit re-check + confirmed-but-unfixed gaps

Phase 9 re-read every file this audit describes (schemas, normalizers,
clients, and the analyzers that consume their output) against the actual
current repository rather than trusting this document, and found it still
accurate. Three real gaps were newly confirmed during that re-check. None
were fixed this phase — each is explained below, with the reasoning for
leaving it alone, per Phase 9's rule to stop and report rather than guess
at an unclear provider contract or make an unrequested core-logic change:

- **`ContractSecurityData.maxWalletPct`/`.maxTxPct` are dead code.**
  `packages/core/src/analyzers/contract-analyzer.ts` reads these two fields
  to populate `MAX_WALLET_RESTRICTION`/`MAX_TX_RESTRICTION` signals, but
  neither `packages/providers/src/goplus/schema.ts` nor `normalize.ts`
  populates them from any GoPlus wire field — GoPlus's `token_security`
  response was never confirmed (live or in docs) to expose a
  max-wallet/max-tx-limit field at all. This isn't a normalization bug
  (nothing is silently defaulting these to false); the signals are simply
  never emitted. Left unfixed: whether GoPlus's real API even has an
  equivalent field is unclear from what this session could verify (the
  live GoPlus response captured in Phase 4/Phase 9 — see
  docs/LIVE_VERIFICATION.md — did not include one), which is exactly the
  "provider API contract is unclear" stop condition Phase 9 calls out
  rather than a safe-to-guess implementation gap.
- **DexScreener `priceUsd` has no `NaN`-guard at the normalize step**
  (`Number(v)` on a malformed numeric string would pass through as `NaN`
  rather than becoming `undefined`), unlike every other numeric field
  audited above. Traced during Phase 9: `priceUsd` is not currently read by
  `packages/core/src/analyzers/liquidity-analyzer.ts` or anywhere else
  downstream, so this gap is real but currently inert — fixing it would be
  an unrequested core-logic touch to a field nothing consumes yet, out of
  scope for a phase whose rule is "implement only what's missing that the
  architecture actually requires."
- **`BlockscoutClient` is hardcoded to chain 4663's `baseUrl` at server
  startup** (`apps/api/src/server.ts`) — confirmed still true, unchanged
  since it was first self-documented. Zero practical impact today, since
  chain 4663 is the only chain with `dexScreenerSlugVerified`/confirmed
  provider support at all; tracked in docs/ROADMAP.md.

Separately, two real, confirmed, *symmetric* test-coverage gaps were found
and fixed this phase (not schema/normalization changes — test-only):
`DexScreenerClient` and `BlockscoutClient` each have the same
schema-validation-failure branch that `GoPlusClient` already had a
regression test for, but neither had one of their own. Added:
`packages/providers/test/dexscreener.test.ts` ("returns ERROR on a
response that fails schema validation" — a `pairs` field present but the
wrong type) and `packages/providers/test/blockscout.test.ts` ("returns
ERROR when the token response is not a well-formed object" — a non-object
root value, since every individual `BlockscoutTokenSchema` field is
independently optional and only a non-object root actually fails it).

## What this audit does NOT cover (honest scope boundary)

- It does not re-derive or re-verify GoPlus/DexScreener field values
  beyond what was already captured live in docs/LIVE_VERIFICATION.md — it
  cross-references those captures, it doesn't repeat the network calls.
- It does not cover Blockscout's real wire shape at all, because that
  remains network-blocked in this environment (see
  docs/LIVE_VERIFICATION.md). The DOCS-ONLY rows above are the explicit,
  itemized version of that gap — not a blanket "Blockscout is
  unverified" note, but exactly which fields are unconfirmed and why that
  matters (the `decimals`-cancellation point above, specifically, is the
  kind of thing that's easy to get wrong and would only surface once real
  data is seen).
- It does not cover the `HoodflowReport` output schema itself
  (signals/relationships/interpretations) — those are derived,
  deterministic, LLM-free computations over the fields audited here, not
  a second external data contract, and are covered instead by the
  analyzer/engine unit tests.
