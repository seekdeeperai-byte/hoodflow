import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool, type PoolConfig } from "pg";
import type { HistoryStore, ScanRecord, TokenIdentity } from "@hoodflow/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Durable, production-usable HistoryStore implementation — see the design
 * rationale in apps/api/migrations/001_init.sql for why this stores each
 * scan as one JSONB row rather than a fully normalized relational schema,
 * and docs/HISTORY_SCHEMA.md for the original schema sketch this
 * deliberately departs from.
 *
 * Reuses the existing HistoryStore interface (packages/core) unchanged —
 * this is a second *implementation*, not a second history architecture.
 * `apps/api/src/server.ts` picks this over InMemoryHistoryStore when
 * DATABASE_URL is configured; unset, HOODFLOW falls back to the in-memory
 * store exactly as before (see apps/api/.env.example and README.md's
 * "Running it" section for the real setup/migration steps).
 *
 * Verified against a real, locally-running PostgreSQL 16 instance during
 * the REAL WORLD DEPLOYMENT verification phase (2026-09-16) — see
 * apps/api/test/postgres-history-store.test.ts, which only runs when
 * DATABASE_URL is set and is skipped (not faked, not fixture-mocked)
 * otherwise. No cloud-managed Postgres credential exists in this sandbox,
 * so "durable history in a real deployed environment" itself remains
 * unverified beyond this local instance — see the final report's
 * DEPLOYMENT section.
 */
export class PostgresHistoryStore implements HistoryStore {
  private readonly pool: Pool;
  private schemaReady: Promise<void> | undefined;

  constructor(config: PoolConfig | string) {
    this.pool = typeof config === "string" ? new Pool({ connectionString: config }) : new Pool(config);
  }

  /** Idempotent — safe to call on every process start (CREATE TABLE/INDEX IF NOT EXISTS). */
  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        const migrationPath = join(__dirname, "..", "..", "migrations", "001_init.sql");
        const sql = readFileSync(migrationPath, "utf-8");
        await this.pool.query(sql);
      })();
    }
    return this.schemaReady;
  }

  async recordScan(entry: ScanRecord): Promise<void> {
    await this.ensureSchema();
    const { chainId, address } = entry.snapshot.token;
    await this.pool.query(
      `INSERT INTO hoodflow_scans (chain_id, address, captured_at, scan_record) VALUES ($1, $2, $3, $4::jsonb)`,
      [chainId, address.toLowerCase(), entry.snapshot.capturedAt, JSON.stringify(entry)],
    );
  }

  async getPreviousSnapshot(token: TokenIdentity, before: string): Promise<ScanRecord | undefined> {
    await this.ensureSchema();
    const res = await this.pool.query<{ scan_record: ScanRecord }>(
      `SELECT scan_record FROM hoodflow_scans
       WHERE chain_id = $1 AND address = $2 AND captured_at < $3
       ORDER BY captured_at DESC LIMIT 1`,
      [token.chainId, token.address.toLowerCase(), before],
    );
    return res.rows[0]?.scan_record;
  }

  async getScansSince(token: TokenIdentity, since: string): Promise<ScanRecord[]> {
    await this.ensureSchema();
    const res = await this.pool.query<{ scan_record: ScanRecord }>(
      `SELECT scan_record FROM hoodflow_scans
       WHERE chain_id = $1 AND address = $2 AND captured_at >= $3
       ORDER BY captured_at ASC`,
      [token.chainId, token.address.toLowerCase(), since],
    );
    return res.rows.map((r) => r.scan_record);
  }

  async getAllScansSince(chainId: number, since: string): Promise<ScanRecord[]> {
    await this.ensureSchema();
    const res = await this.pool.query<{ scan_record: ScanRecord }>(
      `SELECT scan_record FROM hoodflow_scans
       WHERE chain_id = $1 AND captured_at >= $2
       ORDER BY captured_at ASC`,
      [chainId, since],
    );
    return res.rows.map((r) => r.scan_record);
  }

  /** Releases pool connections — call on graceful shutdown; not part of the HistoryStore interface. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
