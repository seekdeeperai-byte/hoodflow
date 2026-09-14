# HOODFLOW — Live Provider Verification (Phase 4)

Status: **partially verified against real live traffic**, 2026-09-14. This
supersedes the "unverified" caveats in `docs/ARCHITECTURE.md` §1 and
`docs/DATA_SOURCES.md` for GoPlus and DexScreener specifically. Read this
alongside `scripts/verify-live-providers.ts`, which is the reproducible way
to re-run and extend this verification from an environment with normal
network access.

## How this verification was actually done (be precise about this)

This sandbox's shell (`bash`/`curl`/Node `fetch`) is still blocked from
reaching third-party hosts by the environment's egress policy — that
constraint from Phase 0 has not changed and `packages/providers`' own HTTP
client has still never made a real network call from inside this sandbox.
What changed this phase: the `WebFetch` tool (a first-party, policy-trusted
fetcher, distinct from the sandbox's general-purpose network access) was
able to reach `api.gopluslabs.io` and `api.dexscreener.com` directly and
return their raw JSON. That let us confirm real API *behavior and shape*
for those two providers. It did **not** let us confirm our own
`GoPlusClient`/`DexScreenerClient` code executes correctly against live
traffic — that's still open, and `scripts/verify-live-providers.ts` is
built to close it the moment this runs somewhere with normal outbound
access.

`robinhoodchain.blockscout.com`'s API returned HTTP 403 to every WebFetch
attempt (both its REST v2 endpoints and its Etherscan-compatible
`/api?module=...` endpoint), while `docs.blockscout.com` (a different host)
fetched fine earlier in Phase 0. The most likely explanation is bot/WAF
protection on the explorer's own domain that specifically targets
non-browser clients — not that the API is down or unsupported (see
"indirect evidence" below). Blockscout verification is **BLOCKED**, not
UNSUPPORTED, and not something this session can talk its way around.

## GoPlus — SUPPORTED, confirmed live

Live call: `GET https://api.gopluslabs.io/api/v1/token_security/4663?contract_addresses=0x5fc5360d0400a0fd4f2af552add042d716f1d168`
(USDG, Robinhood Chain's official stablecoin per docs.robinhood.com).

Real response received: `code: 1`, `message: "OK"`, and a populated result
keyed by the lowercased address, with `token_name: "Global Dollar"`,
`token_symbol: "USDG"`, `total_supply`, `creator_address`,
`creator_balance`/percent, `holder_count: 341809`, `lp_holder_count: 131`,
`is_in_dex: 1`, `is_open_source: 1`, `is_proxy: 1`,
`honeypot_with_same_creator: 0`, `buy_tax`/`sell_tax` present but empty
strings (not "0" — worth noting, see Data Contract Audit below), a
`holders` array, and nine active DEX liquidity positions across Uniswap
V2/V3. Separately, GoPlus's own `/api/v1/supported_chains`-equivalent
listing explicitly includes **"Robinhood (4663)"** as chain #22 of 50
listed chains.

**This confirms:** chain 4663 is supported, the endpoint/path/query-param
shape in `packages/providers/src/goplus/client.ts` is correct, and the
field names in `packages/providers/src/goplus/schema.ts` match a real
response. One schema gap found — see Data Contract Audit.

## DexScreener — SUPPORTED, chain slug corrected

**Phase 0 guessed the slug and left it unverified
(`dexScreenerSlug: undefined` in `chains.ts`). That guess was checked this
phase and found to matter: the slug is `"robinhood"`, not
`"robinhoodchain"`.**

Evidence:
- `GET https://api.dexscreener.com/token-pairs/v1/robinhoodchain/<GME address>` → `[]` (empty — wrong slug, indistinguishable from "no pairs" by design, which is exactly why this needed a positive-control check, not just an empty-response check).
- `GET https://api.dexscreener.com/latest/dex/tokens/<GME address>` (chain-agnostic lookup) → 17 real pairs, every one with `"chainId": "robinhood"`, including a GME/WETH Uniswap pair at ~$178k liquidity / ~$1.36M 24h volume.
- `GET https://api.dexscreener.com/token-pairs/v1/robinhood/<GME address>` → 3 pairs returned, confirming the exact endpoint shape our `DexScreenerClient` uses works with the corrected slug.

**Action taken:** `packages/providers/src/chains.ts` now sets
`dexScreenerSlug: "robinhood"` and `dexScreenerSlugVerified: true` for
chain 4663. The testnet (46630) slug is still unverified — no testnet
liquidity was checked — and stays `undefined`.

## Blockscout — BLOCKED (not verified, not disproven)

Every attempt to reach `robinhoodchain.blockscout.com`'s API (REST v2 and
the legacy `/api?module=...` form) from WebFetch returned HTTP 403.
`robinhoodchain.blockscout.com/tokens` (the human-facing page) loaded but
is a JavaScript SPA shell with no data in the initial HTML — consistent
with Blockscout's current frontend architecture, not evidence of a broken
API.

**Indirect evidence the explorer and its data are real and live:**
web search surfaced Google-indexed Blockscout token detail pages with
real-looking titles and addresses — `.../token/0x7e86381A763F0Ecca2bDF27C54eAC403ddD48123`
("Robinhood Chain GME token details"), plus WALLET and Index token pages.
Blockscout server-renders `<title>`/meta tags for SEO even though the body
is a JS shell, which is consistent with what was found and indexed. This
is suggestive, not confirmation of the JSON contract.

**What this means for the codebase:** `BlockscoutClient` is unchanged this
phase — its endpoint shapes (`/api/v2/tokens/{address}` and
`.../holders`) come from Blockscout's own published API docs
(`docs.blockscout.com/robinhood-api`, which *did* load fine), so they're
believed correct, but "believed correct from docs" is a weaker claim than
"confirmed against a live response" and should be labeled as such. This is
the top item for whoever runs `scripts/verify-live-providers.ts` next from
an unrestricted network.

## Candidate real tokens for testing (confidence-tiered — do not conflate these tiers)

| Token | Address | Source / confidence | Suitable for |
|---|---|---|---|
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | **First-party** — docs.robinhood.com/chain/contracts, and independently confirmed live via GoPlus (above) | Contract security + holder checks. Not liquidity checks — it's a bridge/native stablecoin, not expected to trade against itself. |
| GME (stock token) | `0x7e86381A763F0Ecca2bDF27C54eAC403ddD48123` | **Second-party, live-confirmed** — surfaced via web search, then independently confirmed live and non-empty on DexScreener (17 pairs, real liquidity/volume). Not yet cross-checked against docs.robinhood.com's stock-token registry (that page's live table failed to render in our fetch — see below). | Full pipeline test: contract security, liquidity/volume/buy-sell, and (pending) holders. **Best candidate overall** for exercising every analyzer. |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | **First-party** — docs.robinhood.com/chain/contracts | Contract security baseline only. |
| TSLA / NVDA / AAPL / GOOGL / SPCX / SPY / MSFT / AMZN / META / COIN / QQQ (tokenized stocks) | see sqd.dev table in Phase 4 research | **Third-party, not independently confirmed** — sourced from a blockchain-indexing vendor's blog post, not cross-checked live. Treat as leads, not facts, until someone re-runs the verification script against them. | Not used as the default in this build. |

**A real naming-collision risk found during this research, worth recording
as a case study:** web search also surfaced `gme.meme` ("$GME — GameStop on
Robinhood Chain") and an explainer titled "What Is GME on Robinhood Chain?
Memecoin & Stock Token Risks" — i.e., there appears to be a *memecoin* also
using the GME name/ticker on the same chain, separate from Robinhood's
official tokenized-stock GME. `docs.robinhood.com/chain/contracts` itself
warns: *"a token with a matching name/ticker but a different contract
address is not a Robinhood Stock Token."* This is exactly the failure mode
product spec §21 (token identity matching) exists to prevent, and it's a
live example, not a hypothetical — whoever finalizes which "GME" address is
canonical before shipping a public-facing report about it needs to
cross-check against the official stock-token registry (the live table on
docs.robinhood.com/chain/contracts, which did not render in our fetch —
re-check this with a JS-capable fetch) rather than trusting a search
result or a DEX pair's token name field, which is exactly what an attacker
impersonating a ticker would also control.

## Reproducible run from inside the original build sandbox (2026-09-14)

`pnpm run verify:live` (using `scripts/verify-live-providers.ts`, token
USDG on chain 4663) was actually run from the sandbox this codebase was
built in, exercising the real `GoPlusClient`/`DexScreenerClient`/
`BlockscoutClient` code (not WebFetch, not a mock) against real hostnames.
All three returned HTTP 403 — the sandbox's own egress policy blocking the
connection before it reaches the provider (see docs/ARCHITECTURE.md §2),
consistent with the raw `curl` 403s seen in Phase 0. This is expected and
is not evidence about the providers themselves.

**What this run was still useful for:** it exercised the client code's own
error-handling path against a real (if blocked) HTTP response, and it
caught a real bug — GoPlus and DexScreener's 403 handling fell through to
the generic `ERROR` branch while Blockscout's didn't, so a transport-level
block and a genuine data rejection were indistinguishable for two of the
three providers. Fixed in this phase: all three clients now classify HTTP
403 as `PROVIDER_UNAVAILABLE` (retry-worthy — something blocked the
request) rather than `ERROR` (something is wrong with this specific
request/response), with a code comment explaining why. Regression tests
for this are in `packages/providers/test/*.test.ts`.

Full captured output, for the record:

```
========================================================================
HOODFLOW — Live Provider Verification
Chain:   Robinhood Chain (4663)
Token:   0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
         known as USDG — source: official_docs
========================================================================

--- GoPlus Security (Token Security API v1) ---
HTTP STATUS:          403
DATA STATE:           PROVIDER_UNAVAILABLE
ERROR:                GoPlus returned HTTP 403 (blocked, not a data rejection).

--- DexScreener (token-pairs v1) ---
HTTP STATUS:          403
DATA STATE:           PROVIDER_UNAVAILABLE
ERROR:                DexScreener returned HTTP 403 (blocked, not a data rejection).

--- Blockscout (REST API v2) ---
HTTP STATUS:          403
DATA STATE:           PROVIDER_UNAVAILABLE
ERROR:                Blockscout returned HTTP 403 (blocked, not confirmed absent).
```

No report from this run claims anything about live provider *data* — only
about this sandbox's network policy and, incidentally, about a real bug in
our own error classification that this exercise surfaced and fixed.

## What's still open

1. Confirm Blockscout's actual JSON shape against a live call (needs an
   environment that isn't blocked by their WAF — likely fine from a normal
   residential/cloud IP with a standard browser-like client; this sandbox's
   WebFetch crawler specifically seems to trip it).
2. Run `scripts/verify-live-providers.ts` for real from that environment —
   it exercises our actual client code, not just raw endpoint shape.
3. Resolve the GME identity question against the official registry before
   using it in anything user-facing.
4. DexScreener testnet (46630) slug — not checked.
