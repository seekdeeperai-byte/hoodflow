import { Badge } from "./Badge";

/**
 * Every report view is unambiguously labeled as one of these three — the
 * product principle explicitly requires distinguishing DEMO / LIVE / DATA
 * UNAVAILABLE rather than letting a sample ever look like a real scan.
 */
export function DataModeBadge({ mode }: { mode: "demo" | "live" }) {
  if (mode === "demo") {
    return (
      <Badge tone="neutral">
        <span aria-hidden="true">●</span> Demo data
      </Badge>
    );
  }
  return (
    <Badge tone="positive">
      <span aria-hidden="true">●</span> Live scan
    </Badge>
  );
}
