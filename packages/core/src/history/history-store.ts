import type { TokenIdentity, TokenSnapshot } from "../types/domain.js";
import type { HoodflowReport } from "../types/intelligence.js";

export interface ScanRecord {
  snapshot: TokenSnapshot;
  report: HoodflowReport;
}

/**
 * Historical persistence, minimal by design — see docs/HISTORY_SCHEMA.md.
 * The only questions this needs to answer today: "what was the previous
 * observation for this token?" and "what observations exist since time X?"
 * `apps/api/src/server.ts` is the single place a concrete implementation
 * is constructed — swapping `InMemoryHistoryStore` for a Postgres-backed
 * one is a one-file change everywhere else in the codebase.
 */
export interface HistoryStore {
  recordScan(entry: ScanRecord): Promise<void>;
  /** Most recent scan strictly before `before` (ISO timestamp), if any. */
  getPreviousSnapshot(token: TokenIdentity, before: string): Promise<ScanRecord | undefined>;
  /** All scans at or after `since` (ISO timestamp), oldest first. */
  getScansSince(token: TokenIdentity, since: string): Promise<ScanRecord[]>;
}

export function tokenKey(token: TokenIdentity): string {
  return `${token.chainId}:${token.address.toLowerCase()}`;
}
