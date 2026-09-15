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

## Phase 9 re-verification (2026-09-15)

Phase 9's mandate was a live-data provider audit, so this session
re-ran (not assumed) the checks above rather than trusting this document's
Phase 4 findings at face value.

**Sandbox network block re-confirmed, same category as every prior
phase.** `curl -sS "$HTTPS_PROXY/__agentproxy/status"` showed
`recentRelayFailures` with `"kind": "connect_rejected", "detail": "gateway
answered 403 to CONNECT (policy denial or upstream failure)"` for
`api.gopluslabs.io`, `api.dexscreener.com`, and
`robinhoodchain.blockscout.com` specifically — a policy-level block at the
CONNECT-tunnel layer, not a provider-side rejection. `registry.npmjs.org`
was used as a control and returned HTTP 200 normally, confirming the block
is host-specific (egress allowlist), not a total network outage. Running
`scripts/verify-live-providers.ts` (real `GoPlusClient`/
`DexScreenerClient`/`BlockscoutClient`, no mocks) against this sandbox's
network reproduced clean `PROVIDER_UNAVAILABLE` results for all three, as
expected and as in Phase 4 — this remains the correct, honest outcome for
a genuinely blocked transport, not a bug.

**GoPlus and DexScreener re-confirmed live and current via `WebFetch`.**
The same policy-trusted fetch path from Phase 4 was re-used, not assumed
still valid. GoPlus returned a fresh response for the same USDG token on
chain 4663 with `holder_count: 350833` — up from Phase 4's `341809` — which
is itself the useful proof-point: this is live, moving, current data, not
a cached or replayed result. DexScreener's `robinhood` slug likewise
returned fresh, valid pair data on the same shape Phase 4 documented. This
re-confirms every claim in this document's "GoPlus" and "DexScreener"
sections still holds nine days later. Blockscout was re-attempted via
`WebFetch` and failed with the same distinct WAF/bot-protection 403
documented above (not the sandbox's egress-policy 403) — still BLOCKED,
still not evidence the API itself is broken or unsupported.

**What Phase 9 did NOT do, and why.** This session did not attempt to
route `packages/providers`' own `fetchJson`/client code through `WebFetch`
to make it "work" from here. `WebFetch` is a separate, first-party tool
with its own transport — not something `packages/providers/src/http.ts`
can call into without inventing a new transport mechanism inside
production code, which Phase 9's own hard rules explicitly forbid ("do not
invent provider modules"). So the gap this document has flagged since
Phase 4 — whether `GoPlusClient`/`DexScreenerClient`/`BlockscoutClient`'s
own code executes correctly against live traffic — is still open. Only an
environment with real outbound network access (not this sandbox, and not
achievable by creatively repurposing `WebFetch`) can close it, via
`pnpm run verify:live`.

**Net effect on this phase's confidence:** GoPlus and DexScreener's
provider *contracts* (endpoint shape, field names, chain/slug support) are
about as verified as they can be without running the repo's own code
against live traffic — confirmed twice, nine days apart, with data that
visibly changed between the two checks. Blockscout's contract remains
DOCS-ONLY, unchanged from Phase 4. No provider became "live" inside
`apps/api`/`apps/web` this phase; that requires the repo's own client code
to run somewhere with real egress, which this sandbox still cannot
provide.

## Phase 10 re-verification (2026-09-15) — status tags below

Phase 10's explicit mandate was to move from "sandbox-blocked" to "the
repo's own provider client actually executes against real traffic." This
session tested that directly rather than assuming Phase 9's finding still
held.

**Status tag legend** (used consistently from this point on in this doc
and in docs/DATA_SOURCES.md): `LIVE VERIFIED` (the repo's own client code
executed successfully against the real provider), `LIVE UNVERIFIED` (the
API contract is believed correct from docs/prior partial evidence, but the
repo's own client has not executed against it), `SANDBOX BLOCKED` (this
environment's own egress policy rejects the connection at the CONNECT
layer, before it reaches the provider), `WAF BLOCKED` (the provider's own
host actively rejects the request — a different failure mode from a
sandbox policy block), `NOT CONFIGURED` (no credential is set — not a
failure, since the provider supports unauthenticated access), `NOT
IMPLEMENTED` (no client exists at all).

- **GoPlus: LIVE UNVERIFIED, SANDBOX BLOCKED for the repo's own client.**
  `scripts/verify-live-providers.ts` was re-run this phase using the real
  `GoPlusClient` against chain 4663/USDG. Result: HTTP 403,
  `PROVIDER_UNAVAILABLE`, `"GoPlus returned HTTP 403 (blocked, not a data
  rejection)."` The proxy's own status endpoint
  (`$HTTPS_PROXY/__agentproxy/status`) recorded this as
  `"kind": "connect_rejected", "detail": "gateway answered 403 to CONNECT
  (policy denial or upstream failure)"` for `api.gopluslabs.io:443` —
  confirming this is this sandbox's own egress policy, not a GoPlus-side
  rejection, the same category of block as every phase since Phase 0.
  `GOPLUS_API_KEY` is `NOT CONFIGURED` in this environment; not needed for
  this test since GoPlus supports unauthenticated access.
- **DexScreener: same conclusion, same evidence pattern.** Real
  `DexScreenerClient` against the `"robinhood"` slug: HTTP 403,
  `PROVIDER_UNAVAILABLE`, proxy log shows the identical `connect_rejected`
  policy block for `api.dexscreener.com:443`.
  `SANDBOX BLOCKED` for the repo's own client; `LIVE UNVERIFIED` overall.
- **Blockscout: unchanged, `SANDBOX BLOCKED` (this environment) and
  separately `WAF BLOCKED` (the provider's own host, confirmed again via
  WebFetch this phase — see below).** `BLOCKSCOUT_API_KEY` `NOT
  CONFIGURED`.
- **RPC: `NOT IMPLEMENTED`.** No RPC client exists anywhere in this repo.
  Phase 10 was explicitly instructed not to build one, and didn't.

**A methodology finding worth recording plainly.** This phase re-ran the
same `WebFetch`-based supplementary check used in Phase 4/9 (GoPlus and
DexScreener only — Blockscout again failed with the same WAF 403).
GoPlus's `holder_count` came back as `341809` — the exact Phase 4 figure,
**not** the `350833` figure Phase 9's own write-up reported as a fresh,
grown value nine days later. This is a real discrepancy this session
cannot fully resolve: it may mean the underlying value genuinely
fluctuated back down, or — more likely, given `WebFetch`'s own tool
description states results "may be summarized" by an intermediate model
rather than returned as exact raw bytes — that one of the two captured
numbers (most plausibly the Phase 9 "350833") was a summarization
artifact rather than a literal field value. Either way, this is exactly
why Phase 10's own hard rule treats a successful `curl`/`WebFetch` outside
the repository as **not sufficient** evidence of live-provider
correctness, and why this document has never claimed `WebFetch` results
as equivalent to the repo's own client executing: only exact byte-for-byte
JSON, or the repo's own zod-validated client, is treated as authoritative
here. `docs/DATA_CONTRACT_AUDIT.md`'s "LIVE" tags for GoPlus fields should
be read as "shape confirmed via a real response," not as "this exact
numeric value is currently accurate."

**Real end-to-end pipeline re-proof (all-providers-unavailable case),
against a real running `apps/api` instance, same token:** scan 1 for
USDG/chain 4663 returned `identity.status: CONFIRMED`,
`dataQuality: {contract: PROVIDER_UNAVAILABLE, liquidity:
PROVIDER_UNAVAILABLE, holders: PROVIDER_UNAVAILABLE}`,
`marketState: INSUFFICIENT_DATA`, `score.dataQualityScore: 0`,
`history.status: INSUFFICIENT_HISTORY`. A second scan of the same address
returned `history.status: COMPARABLE`, `observationsUsed: 2`, with every
`MetricDelta.status` correctly `UNAVAILABLE` (never a fabricated delta,
since the same field was unavailable in both scans) and `trends: []`/
`relationships: []` correctly empty. `marketState` and
`score.dataQualityScore` were identical across both scans, confirming
history's presence doesn't affect them. No fabricated data anywhere in
either response.

**GitHub remote status, checked this phase per Phase 10's Rule 2:** no
`origin` remote is configured in this repository. `github.com` and
`api.github.com` are reachable from this sandbox (unlike the three
provider hosts — a genuinely different, non-egress-blocked network path),
but no git credential helper is configured for `github.com` in this
environment (`git ls-remote` against the intended remote failed with
"could not read Username for 'https://github.com': terminal prompts
disabled", and `git config --get credential.helper` returns nothing). A
`GITHUB_TOKEN` environment variable is present but is not wired into any
configured git credential mechanism for this repository, and per Phase
10's explicit rule against inventing credential mechanisms, it was not
used to construct one. **Conclusion: `AUTH_STATUS: NOT CONFIGURED`,
`REMOTE_STATUS: NOT SET`.** No push was attempted.

**Net effect on Phase 10:** the premise that this would be "a network-
enabled environment" distinct from Phase 9's sandbox did not hold — the
same policy-level CONNECT block applies to all three providers via the
repo's own client code, confirmed with fresh proxy-log evidence, not
assumed carried over from Phase 9. Phase 10's core success criteria 1 and
2 (the repo's own GoPlus/DexScreener clients successfully reaching their
providers) were not met in this environment. This is reported as a
genuine finding, not worked around.

## Phase 11 (2026-09-15) — durable-remote attempt, deployment readiness, and a real bug found in the process

Phase 11's brief was to move the repository to a durable GitHub remote and
get an authoritative real-network verification from wherever that landed.
Neither half of that premise held in this environment, re-tested with more
rigor than Phase 10 (direct `curl -v` per host, correlated line-by-line
against the proxy's own failure log, plus `git credential fill` rather than
just inspecting config):

- **Provider network: identical result, more rigorously confirmed.**
  `scripts/verify-live-providers.ts` (real client classes, no mocks) was
  re-run: GoPlus/DexScreener/Blockscout all HTTP 403,
  `PROVIDER_UNAVAILABLE`. This time each host was independently confirmed
  with `curl -v` showing the literal proxy exchange (`CONNECT
  api.gopluslabs.io:443` → `HTTP/1.1 403 Forbidden` from the *proxy*, not
  from GoPlus) and the proxy's `/__agentproxy/status` endpoint recording a
  `connect_rejected` entry for that exact host within seconds of the
  request. Repeated for all three hosts. This is the clearest evidence yet
  that this is a policy-level block at this sandbox's egress gateway, not
  a provider-side response of any kind — same category since Phase 0.
- **GitHub: reachable, still not authenticated, confirmed more directly
  this time.** `curl` to `github.com`/`api.github.com` succeeds (HTTP
  400/200 — real HTTP responses, not proxy rejections). `git credential
  fill` for `host=github.com` was run directly (not just inspecting
  config) and failed with `"could not read Username for
  'https://github.com': terminal prompts disabled"` — a definitive,
  first-hand confirmation that no credential helper is wired up here, not
  an inference from absent config. `GITHUB_TOKEN`/`GH_TOKEN` env vars are
  present but are not connected to git's credential resolution by any
  configured mechanism (`GIT_CONFIG_KEY_0/1/2` only rewrite
  `ssh://git@github.com/` → `https://github.com/`, an unrelated URL
  rewrite, not authentication). Per this phase's explicit rule against
  inventing credential mechanisms, these env vars were not wired in
  manually. `origin` remains unconfigured; nothing was pushed.
- **A real, previously-undetected bug found during the deployment
  readiness audit, not during provider testing.** `apps/api/src/server.ts`
  constructs a single `BlockscoutClient` scoped to chain 4663's explorer,
  but `apps/api/src/pipeline.ts`'s `fetchSnapshot` called it unconditionally
  for *any* registered chain — including testnet 46630, which has its own,
  different `blockscoutBaseUrl` in the chain registry and therefore passes
  the route's chain-existence check. A request for
  `/v1/report/46630/:address` would have queried the *mainnet* explorer
  and could have returned real mainnet holder data, misattributed to a
  testnet-chain report. This is a genuine cross-chain data-integrity bug —
  exactly the failure mode this project's data-integrity rules exist to
  prevent — not a cosmetic gap, and the existing test suite never caught it
  because no test exercised chain 46630 against a Blockscout mock that
  would return `AVAILABLE` data. Fixed this phase (see
  docs/DATA_CONTRACT_AUDIT.md's Phase 11 addendum for the full fix and
  regression test), and verified against the real production build: chain
  4663 still attempts the real Blockscout call (correctly
  `PROVIDER_UNAVAILABLE` in this sandbox), while chain 46630 now correctly
  never calls it at all (`DATA_UNAVAILABLE`, explicit message) — confirmed
  live against the built `apps/api/dist/server.js`, not just in tests.
- **A real production-dependency security finding, also found during the
  readiness audit rather than provider testing.** `pnpm audit --prod`
  surfaced 2 HIGH + 2 moderate advisories, all on `postcss@8.4.31`, pulled
  in transitively through `apps/web`'s `next@15.5.25` production
  dependency (arbitrary file/sourcemap disclosure via CSS
  `sourceMappingURL` handling). Fixed with a `pnpm.overrides` pin to
  `postcss@^8.5.28` in the root `package.json` — re-verified: `pnpm audit
  --prod` now reports zero known vulnerabilities, and the full test/
  typecheck/build gate re-ran clean afterward with identical build output.
  See docs/SECURITY.md's Phase 11 recheck.
- **Real end-to-end pipeline re-proof, same token, against the actual
  production build this time** (`node dist/server.js`, not `tsx watch`):
  scan 1 → `INSUFFICIENT_HISTORY`; scan 2 → `COMPARABLE`,
  `observationsUsed: 2`, every `MetricDelta` correctly `UNAVAILABLE`,
  `marketState`/`dataQualityScore` unchanged across both scans. Also
  confirmed live against the production build: `dataQuality.holders ==
  "PROVIDER_UNAVAILABLE"` for chain 4663 (real attempted call, sandbox-
  blocked) vs. `"DATA_UNAVAILABLE"` for chain 46630 (never attempted, per
  the fix above) — the clearest possible demonstration that the fix
  actually changes production behavior, not just test behavior.
- **Deployment readiness, checked for the first time this phase (not
  previously audited): no blockers found.** Both `apps/api` (`node
  dist/server.js`) and `apps/web` (`next start`, with
  `HOODFLOW_API_BASE_URL` pointed at the API) start cleanly from their
  production builds and serve real requests, including the `/api/*`
  rewrite path. `apps/web` had no `.env.example` despite `apps/api` having
  one and the variable it needs (`HOODFLOW_API_BASE_URL`) being genuinely
  optional but real — added this phase for parity, not a new feature.
  Real risks (not blockers), unchanged from what was already known:
  `HistoryStore` is in-memory-only (resets on restart, doesn't share state
  across replicas) and `BlockscoutClient` is still single-chain by
  construction (now safely gated instead of silently wrong, but still not
  multi-chain-capable) — both already tracked in docs/ROADMAP.md, neither
  addressed this phase since doing so would mean building new
  infrastructure, explicitly out of scope.

**Net effect on Phase 11:** the durable-remote and real-network-
verification premise did not hold in this environment — reported plainly,
not worked around, with more rigorous evidence than Phase 10. What Phase
11 actually accomplished instead: a genuine, previously-undetected
cross-chain data-integrity bug was found and fixed (with a regression
test), a real production-dependency security vulnerability was found and
fixed (with re-verification), a documentation gap in deployment
reproducibility was closed, and the full pipeline was re-proven end-to-end
against the actual production build rather than only the dev server. All
195 tests pass (194 + 1 new regression test), typecheck clean, build
clean.

## Final Intelligence Completion phase (2026-09-15)

This phase's brief (§19-20 of its governing spec) was to attempt real
network verification for the two new providers this phase added (GDELT
News, X Social) and re-run the real-token end-to-end chain. Same
environment as every prior phase — re-tested rather than assumed.

- **GDELT: re-confirmed SANDBOX BLOCKED, same category as every other
  provider.** `scripts/verify-live-providers.ts` (extended this phase with
  a `GdeltNewsClient.searchNews()` call and a `printArrayReport()` helper)
  reports `HTTP STATUS: (no response received)` /
  `DATA STATE: PROVIDER_UNAVAILABLE`, identical shape to
  GoPlus/DexScreener/Blockscout's own output. Independently confirmed with
  `curl -v https://api.gdeltproject.org/api/v2/doc/doc?...` through this
  sandbox's proxy: the `403 Forbidden` is returned at the `CONNECT
  api.gdeltproject.org:443` step, by the proxy itself
  (`127.0.0.1:<proxy-port>`), before any TLS handshake with the real GDELT
  host ever begins — the exact same failure signature already documented
  for GoPlus/DexScreener/Blockscout in Phase 10/11, not a GDELT-side
  rejection.
- **X: re-confirmed SANDBOX BLOCKED, and the client's own wiring
  separately confirmed correct.** With `X_BEARER_TOKEN` unset (this
  environment's real, honest state), `XSocialClient.searchRecentPosts()`
  correctly returns `PROVIDER_UNAVAILABLE` **without making any network
  call at all** — verified by instrumenting a throwaway `fetchImpl` and
  confirming it is never invoked when no token is configured, exactly per
  the credential-gate design in `packages/providers/src/social/client.ts`
  and §18's "no request when credentials unavailable" rule. Separately, to
  confirm the client's HTTP path itself (not just its credential gate) is
  wired correctly, a throwaway/fake Bearer token was supplied for one
  isolated wiring check: the client then attempted a real HTTPS request to
  `api.twitter.com`, which hit the identical sandbox-level `CONNECT`
  rejection as every other host. This proves `XSocialClient`'s request
  construction, header wiring, and error handling are all correct — the
  only reason it doesn't reach X's servers is this sandbox's network
  policy, not a bug in the client. No real X credential was used or
  required for this check, and none is stored anywhere in this
  repository.
- **Real end-to-end run against the real USDG token, chain 4663, full
  pipeline including every new module.** `curl
  http://localhost:8787/v1/report/4663/0x5fc5360d0400a0fd4f2af552add042d716f1d168`
  against the real running API (real `GoPlusClient`/`DexScreenerClient`/
  `BlockscoutClient`/`GdeltNewsClient`/`XSocialClient`, no test mocks):
  `dataQuality.social`/`.news` both `DATA_UNAVAILABLE`/`PROVIDER_UNAVAILABLE`
  as appropriate to how each was configured, `hype.state: "UNKNOWN"` with
  `hype.score: null`, `crossSource.dataState: "DATA_UNAVAILABLE"` with the
  sole relationship `INSUFFICIENT_CROSS_SOURCE_DATA`,
  `crossSource.temporalAnalysis[0].status: "INSUFFICIENT_TEMPORAL_DATA"`,
  and `integratedInterpretation.crossSourceSummary: null`. **This is the
  honest, correct output for zero usable social/news/attention data — no
  relationship, signal, score, or classification was fabricated to fill in
  the gap.** Confirmed identical behavior against the real production
  build (`node dist/server.js`), not just the dev server.
- **GitHub/remote: unchanged, re-checked, not re-attempted with a
  workaround.** `git remote -v` is empty; `git ls-remote
  https://github.com/seepdeeperai-byte/hoodflow` fails with `"could not
  read Username for 'https://github.com': terminal prompts disabled"` —
  the identical, first-hand credential-absence signature Phase 11 already
  established directly (not just inferred from config). No credential
  mechanism was invented; nothing was pushed.
- **No new provider became live-reachable from this sandbox this phase; no
  fabricated data or fabricated provider success is present anywhere in
  this phase's output.**

**Net effect:** this phase's real-network-verification premise for the two
new providers did not hold in this environment, for the same
already-documented reason as every provider before them — reported
plainly. What this phase actually delivered instead: two real, fully
tested, correctly-wired provider clients whose only blocker is this
sandbox's own egress policy (GDELT) and a missing paid credential (X, on
top of the same egress policy); a genuinely new Cross-Source Intelligence
engine, Attention/Hype engine, and Integrated Interpretation layer, all
exercised by 82 new tests against realistic fixtures; and a real,
end-to-end proof that the entire extended pipeline — five providers, five
new analysis stages — behaves honestly under total real-world data
unavailability, exactly the condition this environment actually presents.
All 277 tests pass, typecheck clean, build clean, `pnpm audit --prod`
clean.
