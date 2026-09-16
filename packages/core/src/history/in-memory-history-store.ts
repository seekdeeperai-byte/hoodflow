import type { TokenIdentity } from "../types/domain.js";
import { type HistoryStore, type ScanRecord, tokenKey } from "./history-store.js";

/**
 * In-process implementation, sufficient to prove the HistoryStore
 * mechanism works end-to-end (see HOLDER_GROWTH wiring in
 * apps/api/src/pipeline.ts) but NOT durable — everything is lost on
 * restart, and it will not work correctly across more than one API
 * process (each process has its own Map). Fine for local dev and for
 * this phase's verification; a real deployment needs the Postgres-backed
 * implementation described in docs/HISTORY_SCHEMA.md before this scales
 * past a single instance.
 */
/**
 * Bounds per-token memory growth. This does NOT bound total memory across
 * all tokens — an attacker who requests reports for enough distinct
 * addresses can still grow this store without limit, on top of whatever
 * the global rate limiter slows down. That's a real, open gap for this
 * in-memory implementation specifically — see docs/SECURITY.md. A
 * Postgres-backed HistoryStore with an actual retention policy (see
 * docs/HISTORY_SCHEMA.md) is the real fix, not a bigger in-memory cap.
 */
const MAX_SCANS_PER_TOKEN = 1000;

export class InMemoryHistoryStore implements HistoryStore {
  private readonly scansByToken = new Map<string, ScanRecord[]>();

  async recordScan(entry: ScanRecord): Promise<void> {
    const key = tokenKey(entry.snapshot.token);
    const existing = this.scansByToken.get(key) ?? [];
    existing.push(entry);
    existing.sort((a, b) => Date.parse(a.snapshot.capturedAt) - Date.parse(b.snapshot.capturedAt));
    if (existing.length > MAX_SCANS_PER_TOKEN) {
      existing.splice(0, existing.length - MAX_SCANS_PER_TOKEN); // drop oldest
    }
    this.scansByToken.set(key, existing);
  }

  /**
   * REAL WORLD DEPLOYMENT MASTERPLUS audit fix (2026-09-16): this was `t <
   * beforeMs` (strict less-than) and lost a genuinely-prior scan whenever
   * two requests for the same token landed in the same millisecond — real,
   * reproducible via `apps/api/test/report.route.test.ts`'s back-to-back
   * `app.inject()` calls, not a flaky test. `capturedAt` (see
   * apps/api/src/pipeline.ts) has only millisecond resolution, so two
   * distinct, sequential HTTP requests can share an identical timestamp.
   * `<=` is safe here specifically because the call site
   * (apps/api/src/routes/report.ts) always calls `getPreviousSnapshot`
   * BEFORE `recordScan` for the *current* scan — the scan being looked up
   * for can never itself be in `scans` yet, so there is no risk of a scan
   * matching (or ranking equal to) itself.
   */
  async getPreviousSnapshot(token: TokenIdentity, before: string): Promise<ScanRecord | undefined> {
    const key = tokenKey(token);
    const scans = this.scansByToken.get(key) ?? [];
    const beforeMs = Date.parse(before);
    let latest: ScanRecord | undefined;
    for (const scan of scans) {
      const t = Date.parse(scan.snapshot.capturedAt);
      if (t <= beforeMs && (!latest || t > Date.parse(latest.snapshot.capturedAt))) {
        latest = scan;
      }
    }
    return latest;
  }

  async getScansSince(token: TokenIdentity, since: string): Promise<ScanRecord[]> {
    const key = tokenKey(token);
    const scans = this.scansByToken.get(key) ?? [];
    const sinceMs = Date.parse(since);
    return scans.filter((s) => Date.parse(s.snapshot.capturedAt) >= sinceMs);
  }

  async getAllScansSince(chainId: number, since: string): Promise<ScanRecord[]> {
    const sinceMs = Date.parse(since);
    const results: ScanRecord[] = [];
    for (const [key, scans] of this.scansByToken) {
      if (!key.startsWith(`${chainId}:`)) continue;
      for (const scan of scans) {
        if (Date.parse(scan.snapshot.capturedAt) >= sinceMs) results.push(scan);
      }
    }
    results.sort((a, b) => Date.parse(a.snapshot.capturedAt) - Date.parse(b.snapshot.capturedAt));
    return results;
  }

  /** Test/debug helper only — not part of the HistoryStore interface. */
  clear(): void {
    this.scansByToken.clear();
  }
}
