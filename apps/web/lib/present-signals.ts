import type { Signal } from "@hoodflow/core";

/**
 * Maps a Signal's `source` field (unchanged, backend-assigned — see
 * packages/core's analyzers) to a module heading. Only sources the backend
 * actually emits are listed here; there is deliberately no "Deployer
 * History" or "Market Activity" entry, because no analyzer in this
 * repository produces one yet (see docs/DATA_SOURCES.md /
 * docs/INTELLIGENCE_ENGINE.md "What isn't built yet"). Liquidity/market-flow
 * signals (buy/sell imbalance, price momentum) come from the same
 * `source: "liquidity"` analyzer as pooled-liquidity signals, so they share
 * one module rather than an invented separate one.
 */
export const MODULE_LABELS: Record<string, string> = {
  contract: "Contract Risk",
  liquidity: "Liquidity & Market Activity",
  holders: "Holder Behavior",
  identity: "Identity",
  historical: "Historical Change",
};

export function moduleLabel(source: string): string {
  return MODULE_LABELS[source] ?? source;
}

/** Stable module display order — risk-relevant modules first, informational ones last. */
const MODULE_ORDER = ["contract", "liquidity", "holders", "identity", "historical"];

export function groupSignalsByModule(signals: Signal[]): Array<{ source: string; label: string; signals: Signal[] }> {
  const bySource = new Map<string, Signal[]>();
  for (const signal of signals) {
    const bucket = bySource.get(signal.source) ?? [];
    bucket.push(signal);
    bySource.set(signal.source, bucket);
  }
  const sources = [...bySource.keys()].sort((a, b) => {
    const ai = MODULE_ORDER.indexOf(a);
    const bi = MODULE_ORDER.indexOf(b);
    return (ai === -1 ? MODULE_ORDER.length : ai) - (bi === -1 ? MODULE_ORDER.length : bi);
  });
  return sources.map((source) => ({ source, label: moduleLabel(source), signals: bySource.get(source)! }));
}

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  OWNERSHIP_RISK: "Ownership",
  PROXY_RISK: "Proxy contract",
  UPGRADEABILITY_RISK: "Upgradeable logic",
  BLACKLIST_CAPABILITY: "Blacklist function",
  PAUSE_CAPABILITY: "Pause function",
  MINT_CAPABILITY: "Mint function",
  FEE_RISK: "Transfer tax",
  TRANSFER_RESTRICTION: "Transfer restriction",
  MAX_WALLET_RESTRICTION: "Max wallet limit",
  MAX_TX_RESTRICTION: "Max transaction limit",
  HONEYPOT_RISK: "Honeypot pattern",
  LIQUIDITY_STRENGTH: "Pooled liquidity",
  LIQUIDITY_GROWTH: "Liquidity growth",
  LIQUIDITY_DECLINE: "Liquidity decline",
  MC_LIQUIDITY_DIVERGENCE: "Market cap vs. liquidity",
  VOLUME_LIQUIDITY_DIVERGENCE: "Volume vs. liquidity",
  HOLDER_CONCENTRATION: "Holder base size",
  TOP10_CONCENTRATION: "Top 10 concentration",
  TOP20_CONCENTRATION: "Top 20 concentration",
  HOLDER_GROWTH: "Holder growth",
  HOLDER_CONCENTRATION_INCREASE: "Concentration increasing",
  HOLDER_CONCENTRATION_DECREASE: "Concentration decreasing",
  BUY_SELL_IMBALANCE: "Buy/sell balance",
  PRICE_MOMENTUM: "Price momentum",
  IDENTITY_CONFIRMED: "Identity confirmed",
  IDENTITY_AMBIGUITY: "Identity ambiguous",
  IDENTITY_MISMATCH: "Identity mismatch",
  IDENTITY_UNVERIFIED: "Identity unverified",
  IDENTITY_COLLISION: "Identity collision",
  OFFICIAL_IDENTITY_MATCH: "Official identity match",
  NON_OFFICIAL_IDENTITY_CONTEXT: "Unofficial identity context",
};

export function signalTypeLabel(signalType: string): string {
  return SIGNAL_TYPE_LABELS[signalType] ?? signalType;
}
