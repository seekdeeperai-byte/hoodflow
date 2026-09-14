#!/usr/bin/env -S npx tsx
/**
 * HOODFLOW — Live Provider Verification
 *
 * Reproducible procedure for confirming HOODFLOW's actual client code
 * (packages/providers) behaves correctly against REAL provider traffic —
 * not fixtures, not WebFetch-summarized JSON. Run this from any
 * environment with normal outbound network access (a local machine, a
 * deployment server, any network-enabled CI runner). It cannot run
 * meaningfully inside the sandbox this codebase was originally built in —
 * that sandbox's egress is policy-restricted to package registries only.
 * See docs/LIVE_VERIFICATION.md for what WAS confirmed from there (via a
 * different tool with broader access) and what's still open.
 *
 * Usage:
 *   pnpm --filter @hoodflow/api exec tsx ../../scripts/verify-live-providers.ts
 *   CHAIN_ID=4663 TOKEN_ADDRESS=0x... pnpm --filter @hoodflow/api exec tsx ../../scripts/verify-live-providers.ts
 *
 * Env (all optional):
 *   CHAIN_ID            default 4663 (Robinhood Chain mainnet)
 *   TOKEN_ADDRESS        default: the chain's first `knownTokens` entry (see packages/providers/src/chains.ts)
 *   GOPLUS_API_KEY        never printed
 *   BLOCKSCOUT_API_KEY    never printed
 *
 * Exit code is 0 even when a provider fails — a provider being down is a
 * finding to report, not a script bug. Exit code is 1 only for usage
 * errors (bad chain id, no address available).
 */
import { getChainConfig } from "@hoodflow/providers";
import { GoPlusClient } from "@hoodflow/providers";
import { DexScreenerClient } from "@hoodflow/providers";
import { BlockscoutClient } from "@hoodflow/providers";
import type { ProviderResult } from "@hoodflow/core";

const chainId = Number(process.env.CHAIN_ID ?? 4663);
const chain = getChainConfig(chainId);

if (!chain) {
  console.error(`Unknown chain id ${chainId} — not in packages/providers/src/chains.ts's registry.`);
  process.exit(1);
}

const tokenAddress = process.env.TOKEN_ADDRESS ?? chain.knownTokens[0]?.address;
if (!tokenAddress) {
  console.error(`No TOKEN_ADDRESS given and chain ${chainId} has no knownTokens entries to default to.`);
  process.exit(1);
}

const knownToken = chain.knownTokens.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase());

function printHeader() {
  console.log("=".repeat(72));
  console.log("HOODFLOW — Live Provider Verification");
  console.log(`Chain:   ${chain!.name} (${chainId})`);
  console.log(`Token:   ${tokenAddress}`);
  if (knownToken) {
    console.log(`         known as ${knownToken.symbol} — source: ${knownToken.source}`);
    console.log(`         note: ${knownToken.note}`);
  } else {
    console.log("         (not in chains.ts's knownTokens — treat any result as unverified-token-identity)");
  }
  console.log(`Run at:  ${new Date().toISOString()}`);
  console.log("=".repeat(72));
}

interface Report {
  provider: string;
  request: string;
  httpStatus: number | string;
  latencyMs: number | string;
  responseValidation: string;
  normalization: string;
  dataState: string;
  fieldsAvailable: string[];
  fieldsMissing: string[];
  error?: string;
}

function fieldsOf(data: Record<string, unknown> | undefined, canonical: string[]): { available: string[]; missing: string[] } {
  const available: string[] = [];
  const missing: string[] = [];
  for (const key of canonical) {
    if (data && data[key] !== undefined && data[key] !== null) available.push(key);
    else missing.push(key);
  }
  return { available, missing };
}

function reportFromResult<T extends Record<string, unknown>>(
  provider: string,
  request: string,
  result: ProviderResult<T>,
  canonicalFields: string[],
): Report {
  const { available, missing } = fieldsOf(result.data, canonicalFields);
  return {
    provider,
    request,
    httpStatus: result.httpStatus ?? "(no response received)",
    latencyMs: result.latencyMs ?? "n/a",
    responseValidation: result.state === "ERROR" ? "FAILED — see error" : result.data ? "PASSED (zod schema)" : "N/A (no data)",
    normalization: result.data ? "OK — mapped into internal domain model" : "N/A",
    dataState: result.state,
    fieldsAvailable: available,
    fieldsMissing: missing,
    error: result.error,
  };
}

function printReport(r: Report) {
  console.log("");
  console.log(`--- ${r.provider} ---`);
  console.log(`REQUEST:              ${r.request}`);
  console.log(`HTTP STATUS:          ${r.httpStatus}`);
  console.log(`LATENCY:              ${r.latencyMs}${typeof r.latencyMs === "number" ? "ms" : ""}`);
  console.log(`RESPONSE VALIDATION:  ${r.responseValidation}`);
  console.log(`NORMALIZATION:        ${r.normalization}`);
  console.log(`DATA STATE:           ${r.dataState}`);
  console.log(`KEY FIELDS AVAILABLE: ${r.fieldsAvailable.length ? r.fieldsAvailable.join(", ") : "(none)"}`);
  console.log(`KEY FIELDS MISSING:   ${r.fieldsMissing.length ? r.fieldsMissing.join(", ") : "(none)"}`);
  if (r.error) console.log(`ERROR:                ${r.error}`);
}

async function main() {
  printHeader();

  const goplus = new GoPlusClient({ apiKey: process.env.GOPLUS_API_KEY });
  const goplusResult = await goplus.getTokenSecurity(chainId, tokenAddress!);
  printReport(
    reportFromResult(
      "GoPlus Security (Token Security API v1)",
      `GET https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${tokenAddress!.toLowerCase()}`,
      goplusResult,
      [
        "isOpenSource",
        "isProxy",
        "ownerAddress",
        "isMintable",
        "isHoneypot",
        "isBlacklisted",
        "buyTaxPct",
        "sellTaxPct",
        "holderCount",
        "top10HolderPct",
        "creatorAddress",
      ],
    ),
  );

  const dexscreener = new DexScreenerClient();
  const dexSlug = chain!.dexScreenerSlug;
  const dexRequestUrl = dexSlug
    ? `GET https://api.dexscreener.com/token-pairs/v1/${dexSlug}/${tokenAddress!.toLowerCase()}`
    : "(skipped — no verified DexScreener slug for this chain, see chains.ts)";
  if (dexSlug) {
    const dexResult = await dexscreener.getTokenLiquidity(dexSlug, tokenAddress!);
    printReport(
      reportFromResult("DexScreener (token-pairs v1)", dexRequestUrl, dexResult, [
        "dexId",
        "pairAddress",
        "priceUsd",
        "liquidityUsd",
        "marketCapUsd",
        "fdvUsd",
        "volumeUsd24h",
        "priceChangePct24h",
        "buys24h",
        "sells24h",
        "pairCreatedAt",
      ]),
    );
  } else {
    console.log("\n--- DexScreener (token-pairs v1) ---");
    console.log(`REQUEST:              ${dexRequestUrl}`);
    console.log("DATA STATE:           DATA_UNAVAILABLE (slug not verified — this is the gate working as designed)");
  }

  const blockscout = new BlockscoutClient({ baseUrl: chain!.blockscoutBaseUrl, apiKey: process.env.BLOCKSCOUT_API_KEY });
  const blockscoutResult = await blockscout.getHolderSummary(tokenAddress!);
  printReport(
    reportFromResult(
      "Blockscout (REST API v2)",
      `GET ${chain!.blockscoutBaseUrl}/api/v2/tokens/${tokenAddress!.toLowerCase()} (+ /holders)`,
      blockscoutResult,
      ["holderCount", "top10Pct", "top20Pct"],
    ),
  );

  console.log("");
  console.log("=".repeat(72));
  console.log("Done. Paste this output into docs/LIVE_VERIFICATION.md's history, or attach it");
  console.log("to whatever tracks this phase's verification — do not hand-edit the DATA STATE");
  console.log("lines above; they came directly from the real client code's return values.");
  console.log("=".repeat(72));
}

main().catch((err) => {
  console.error("Verification script crashed (this itself is a finding — report it):", err);
  process.exit(1);
});
