import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool, type PoolConfig } from "pg";
import type { HistoryStore, ScanRecord, TokenIdentity } from "@hoodflow/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Default sink for idle-connection pool errors. Message only — never the
 * error object, which can reference the pool's connection config (and with
 * it the database password).
 */
function defaultPoolErrorLogger(message: string): void {
  // eslint-disable-next-line no-console
  console.error("[hoodflow] PostgreSQL pool error on an idle connection (pool will reconnect):", message);
}

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

  constructor(config: PoolConfig | string, onPoolError: (message: string) => void = defaultPoolErrorLogger) {
    this.pool = typeof config === "string" ? new Pool({ connectionString: config }) : new Pool(config);

    /**
     * SECURITY HARDENING (2026-09-16) — fixes a verified process-killing
     * defect, not a theoretical one.
     *
     * `pg.Pool` emits an `'error'` event when an **idle** pooled connection is
     * terminated by the backend. `EventEmitter` rethrows an `'error'` event
     * that has no listener as an uncaught exception, so before this handler
     * existed the entire API process exited. Reproduced directly: stopping
     * PostgreSQL under a running production server killed it with
     * `throw er; // Unhandled 'error' event` /
     * `error: terminating connection due to administrator command`.
     *
     * That is not an exotic condition — it fires on any managed-Postgres
     * maintenance restart or failover, any admin-terminated backend, any
     * `idle_session_timeout`, and any network/load-balancer idle reap. Because
     * it happens on *idle* clients, it could kill an instance that was serving
     * no traffic at all, and under an orchestrator it would restart-loop for as
     * long as the database was unavailable.
     *
     * Swallowing the event (after logging it) is the documented, correct
     * behavior: `pg` discards the broken client and opens a fresh one on the
     * next checkout. Queries that are actually in flight still reject normally
     * and surface through the route's own error path — this handler only stops
     * an idle-socket teardown from being fatal, and never converts a real query
     * failure into a silent success.
     *
     * Only the error *message* is logged. The connection string carries the
     * database password, and `err` on a pg client can reference connection
     * config, so the object itself is never logged.
     */
    this.pool.on("error", (err: unknown) => {
      onPoolError(err instanceof Error ? err.message : "Unknown PostgreSQL pool error.");
    });
  }

  /** Idempotent — safe to call on every process start (CREATE TABLE/INDEX IF NOT EXISTS). */
  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        const migrationPath = join(__dirname, "..", "..", "migrations", "001_init.sql");
        const sql = readFileSync(migrationPath, "utf-8");
        await this.pool.query(sql);
      })();
      // A failed schema bootstrap must not be cached as a permanently-rejected
      // promise: if the database was merely unreachable at startup, the next
      // request should be able to retry rather than fail forever on a settled
      // rejection. The catch below clears the memo, and the rejection is still
      // propagated to this caller.
      this.schemaReady.catch(() => {
        this.schemaReady = undefined;
      });
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
    // `<=`, not `<` — see the identical fix + rationale in InMemoryHistoryStore's
    // getPreviousSnapshot (packages/core/src/history/in-memory-history-store.ts).
    // `capturedAt` has only millisecond resolution (JS `Date#toISOString`), so two
    // distinct, sequential HTTP requests for the same token can share an identical
    // timestamp; `<=` is safe because the route always calls getPreviousSnapshot
    // for a scan BEFORE that same scan's own recordScan — it can never match itself.
    const res = await this.pool.query<{ scan_record: ScanRecord }>(
      `SELECT scan_record FROM hoodflow_scans
       WHERE chain_id = $1 AND address = $2 AND captured_at <= $3
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
