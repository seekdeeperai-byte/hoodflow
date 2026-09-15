import type { HolderSummary } from "@hoodflow/core";
import type { BlockscoutHolder, BlockscoutToken } from "./schema.js";

/**
 * Top10/top20 percentages are computed from whatever holder page was
 * fetched (first page, Blockscout returns holders sorted desc by balance)
 * relative to total_supply. If total_supply is missing or zero, those
 * percentages are omitted rather than divided by zero.
 */
export function normalizeBlockscoutHolders(token: BlockscoutToken, holders: BlockscoutHolder[]): HolderSummary {
  const totalSupply = token.total_supply ? Number(token.total_supply) : undefined;
  const holderCount = token.holders_count !== undefined && token.holders_count !== null ? Number(token.holders_count) : undefined;

  let top10Pct: number | undefined;
  let top20Pct: number | undefined;
  if (totalSupply && totalSupply > 0 && holders.length > 0) {
    const balances = holders.map((h) => Number(h.value ?? 0)).filter((n) => !Number.isNaN(n));
    const sum = (n: number) => balances.slice(0, n).reduce((a, b) => a + b, 0);
    top10Pct = (sum(10) / totalSupply) * 100;
    top20Pct = (sum(20) / totalSupply) * 100;
  }

  return {
    // Contextual identity evidence only (Phase 5) — never authoritative on its own.
    // Blockscout sends these as `string | null | undefined`; normalized to `undefined`
    // (never an empty-string/null placeholder) to match ProviderObservedIdentity's optional-string contract.
    observedName: token.name ?? undefined,
    observedSymbol: token.symbol ?? undefined,
    holderCount,
    top10Pct,
    top20Pct,
  };
}
