/**
 * Pure number/label formatting only. Nothing here computes intelligence —
 * every value passed in already came from the backend's HoodflowReport.
 * See lib/present-history.ts for how these are combined into display copy.
 */

export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatSignedUsd(value: number): string {
  const formatted = formatUsd(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function formatPct(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatPp(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}pp`;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function formatSignedCount(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded.toLocaleString("en-US")}`;
}

const METRIC_LABELS: Record<string, string> = {
  liquidityUsd: "Liquidity",
  holderCount: "Holder Count",
  top10Pct: "Top 10 Concentration",
  top20Pct: "Top 20 Concentration",
};

export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric;
}

/** "BROAD_BASED_LIQUIDITY_GROWTH" -> "Broad-based liquidity growth" */
export function enumToTitle(value: string): string {
  const words = value.toLowerCase().split("_");
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

export function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "Unknown time";
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatRelativeAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown age";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
