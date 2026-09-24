import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DataState, type HoodflowReport, type TokenSnapshot } from "@hoodflow/core";
import { PostgresHistoryStore } from "../src/history/postgres-history-store.js";

/**
 * Real integration test against a real PostgreSQL instance — no mock, no
 * fixture database, no in-memory stand-in for Postgres itself. Per the
 * governing REAL WORLD DEPLOYMENT spec's own non-fabrication rule ("never
 * convert 'not tested' into 'passed'"), this suite does NOT fake a passing
 * result when no real database is reachable: it skips (visibly, via
 * `describe.skipIf`, not silently) unless DATABASE_URL is actually set to a
 * real, reachable Postgres connection string. This was run for real during
 * the REAL WORLD DEPLOYMENT verification phase (2026-09-16) against a
 * locally-started PostgreSQL 16 instance in this sandbox — see the final
 * report's DEPLOYMENT/TEST RESULTS sections for the real, captured
 * evidence. No managed cloud Postgres credential exists in this sandbox, so
 * this only proves the code against a real local instance, not a production
 * one — that distinction is preserved rather than blurred.
 */
const DATABASE_URL = process.env.DATABASE_URL;

function makeSnapshot(overrides: Partial<TokenSnapshot["token"]> & { capturedAt?: string } = {}): TokenSnapshot {
  return {
    token: { chainId: 4663, address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ...overrides },
    capturedAt: overrides.capturedAt ?? new Date().toISOString(),
    identity: { chainId: 4663, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "UNVERIFIED", confidence: null, match: null, conflicts: [], providerObserved: [], observedAt: new Date().toISOString() },
    contract: { state: DataState.PROVIDER_UNAVAILABLE },
    liquidity: { state: DataState.PROVIDER_UNAVAILABLE },
    holders: { state: DataState.PROVIDER_UNAVAILABLE },
  } as unknown as TokenSnapshot;
}

const fakeReport = {} as HoodflowReport;

/**
 * Runs with or without a database: the inlined `SCHEMA_DDL` in
 * postgres-history-store.ts and the human/psql-facing
 * apps/api/migrations/001_init.sql must never drift apart. The constant
 * exists only because reading the .sql file at runtime is not portable to a
 * bundled/serverless deployment; the .sql file remains the documented source
 * of truth, so a change to one that isn't mirrored in the other is a bug.
 */
describe("schema DDL parity", () => {
  it("the inlined SCHEMA_DDL creates exactly the same table and indexes as migrations/001_init.sql", () => {
    const source = readFileSync(new URL("../src/history/postgres-history-store.ts", import.meta.url), "utf-8");
    const migration = readFileSync(new URL("../migrations/001_init.sql", import.meta.url), "utf-8");

    // Compare the executable statements only — the .sql file carries a long
    // rationale comment block that the TS constant deliberately does not.
    const statements = (sql: string): string[] =>
      sql
        .split(";")
        .map((s) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim())
        .filter((s) => s.length > 0)
        .map((s) => s.toUpperCase());

    const inlined = source.match(/const SCHEMA_DDL = `([\s\S]*?)`;/);
    expect(inlined, "SCHEMA_DDL constant should exist in postgres-history-store.ts").not.toBeNull();

    expect(statements(inlined![1])).toEqual(statements(migration));
  });
});

describe.skipIf(!DATABASE_URL)("PostgresHistoryStore (real Postgres integration)", () => {
  let store: PostgresHistoryStore;

  beforeAll(() => {
    store = new PostgresHistoryStore(DATABASE_URL!);
  });

  afterAll(async () => {
    // Real cleanup, not just of the connection: this test's last-run inserted rows
    // (some deliberately malformed/incomplete, e.g. the round-trip and durability
    // tests) must never linger in a shared local DATABASE_URL past this suite — a
    // real HOODFLOW MASTERPLUS finding was exactly this: leftover fixture rows from
    // this file crashed the real running server's /v1/pulse endpoint (see
    // packages/core/src/pulse/pulse-engine.ts's scanEvents() fix + regression test)
    // when a developer pointed a manual `pnpm --filter @hoodflow/api run start` at
    // the same database used for `pnpm test`. Truncate before closing the pool.
    const pool = (store as unknown as { pool: { query: (sql: string) => Promise<unknown> } }).pool;
    await pool.query("TRUNCATE TABLE hoodflow_scans").catch(() => {});
    await store.close();
  });

  beforeEach(async () => {
    // Real cleanup between tests via real SQL against the real table — not a stub.
    // TRUNCATE (not DROP): the store's ensureSchema() only runs CREATE TABLE IF NOT
    // EXISTS once per instance (memoized), so dropping the table out from under an
    // already-initialized store would break every subsequent recordScan in this file.
    const pool = (store as unknown as { pool: { query: (sql: string) => Promise<unknown> } }).pool;
    await pool.query("CREATE TABLE IF NOT EXISTS hoodflow_scans (id BIGSERIAL PRIMARY KEY, chain_id INTEGER NOT NULL, address TEXT NOT NULL, captured_at TIMESTAMPTZ NOT NULL, scan_record JSONB NOT NULL, inserted_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    await pool.query("TRUNCATE TABLE hoodflow_scans");
  });

  it("records a scan and retrieves it as the previous snapshot for a later timestamp", async () => {
    const t1 = "2026-09-16T10:00:00.000Z";
    const snapshot = makeSnapshot({ capturedAt: t1 });
    await store.recordScan({ snapshot, report: fakeReport });

    const previous = await store.getPreviousSnapshot(snapshot.token, "2026-09-16T11:00:00.000Z");
    expect(previous).toBeDefined();
    expect(previous!.snapshot.capturedAt).toBe(t1);
    expect(previous!.snapshot.token.address).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  // Regression test for the same real bug fixed in InMemoryHistoryStore (see
  // packages/core/test/history-store.test.ts) — the SQL query used strict `<`
  // on captured_at, so two requests colliding on the same millisecond would
  // silently lose the previous scan. Safe as `<=` because the real call site
  // always looks up the previous scan before recording the current one.
  it("treats a scan recorded at exactly the same millisecond as 'before' as a real previous scan, not a missing one", async () => {
    const sharedTimestamp = "2026-09-16T14:00:00.000Z";
    const snapshot = makeSnapshot({ capturedAt: sharedTimestamp, address: "0x4444444444444444444444444444444444444d" });
    await store.recordScan({ snapshot, report: fakeReport });

    const previous = await store.getPreviousSnapshot(snapshot.token, sharedTimestamp);
    expect(previous).toBeDefined();
    expect(previous?.snapshot.capturedAt).toBe(sharedTimestamp);
  });

  /**
   * Regression test for a verified process-killing defect (2026-09-16):
   * `pg.Pool` emits `'error'` on idle-connection teardown, and an `'error'`
   * event with no listener is rethrown by EventEmitter as an uncaught
   * exception — which killed the whole API process whenever PostgreSQL
   * restarted, failed over, or reaped an idle connection. The store must
   * register a listener so the event is handled rather than fatal.
   */
  it("registers a pool 'error' listener so an idle-connection teardown can never become an uncaught exception", () => {
    const local = new PostgresHistoryStore(DATABASE_URL!);
    const pool = (local as unknown as { pool: { listenerCount: (e: string) => number; emit: (e: string, a: unknown) => boolean } }).pool;
    expect(pool.listenerCount("error")).toBeGreaterThan(0);

    // Emitting 'error' must not throw. Without a listener this line is exactly
    // what terminates the process in production.
    expect(() => pool.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();
    return (local as unknown as { close: () => Promise<void> }).close();
  });

  it("routes pool errors to the injected logger as a message only, never the error object (which can reference the connection config/password)", () => {
    const seen: string[] = [];
    const local = new PostgresHistoryStore(DATABASE_URL!, (message) => seen.push(message));
    const pool = (local as unknown as { pool: { emit: (e: string, a: unknown) => boolean } }).pool;
    pool.emit("error", new Error("terminating connection due to administrator command"));
    expect(seen).toEqual(["terminating connection due to administrator command"]);
    return (local as unknown as { close: () => Promise<void> }).close();
  });

  it("returns undefined for getPreviousSnapshot when no prior scan exists", async () => {
    const result = await store.getPreviousSnapshot(
      { chainId: 4663, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      new Date().toISOString(),
    );
    expect(result).toBeUndefined();
  });

  it("getScansSince returns scans oldest-first for one token, excluding scans for a different token", async () => {
    const tokenA = { chainId: 4663, address: "0xcccccccccccccccccccccccccccccccccccccc" };
    const tokenB = { chainId: 4663, address: "0xdddddddddddddddddddddddddddddddddddddd" };
    await store.recordScan({ snapshot: makeSnapshot({ ...tokenA, capturedAt: "2026-09-16T09:00:00.000Z" }), report: fakeReport });
    await store.recordScan({ snapshot: makeSnapshot({ ...tokenA, capturedAt: "2026-09-16T10:00:00.000Z" }), report: fakeReport });
    await store.recordScan({ snapshot: makeSnapshot({ ...tokenB, capturedAt: "2026-09-16T09:30:00.000Z" }), report: fakeReport });

    const scans = await store.getScansSince(tokenA, "2026-09-16T08:00:00.000Z");
    expect(scans).toHaveLength(2);
    expect(scans[0].snapshot.capturedAt).toBe("2026-09-16T09:00:00.000Z");
    expect(scans[1].snapshot.capturedAt).toBe("2026-09-16T10:00:00.000Z");
    expect(scans.every((s) => s.snapshot.token.address === tokenA.address)).toBe(true);
  });

  it("getAllScansSince returns scans across every token on a chain, oldest first, excluding other chains", async () => {
    const tokenA = { chainId: 4663, address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" };
    const tokenB = { chainId: 4663, address: "0xffffffffffffffffffffffffffffffffffffffff".slice(0, 42) };
    const tokenOtherChain = { chainId: 46630, address: "0x1111111111111111111111111111111111111a" };
    await store.recordScan({ snapshot: makeSnapshot({ ...tokenA, capturedAt: "2026-09-16T09:00:00.000Z" }), report: fakeReport });
    await store.recordScan({ snapshot: makeSnapshot({ ...tokenB, capturedAt: "2026-09-16T09:15:00.000Z" }), report: fakeReport });
    await store.recordScan({ snapshot: makeSnapshot({ ...tokenOtherChain, capturedAt: "2026-09-16T09:20:00.000Z" }), report: fakeReport });

    const all = await store.getAllScansSince(4663, "2026-09-16T08:00:00.000Z");
    expect(all).toHaveLength(2);
    expect(all[0].snapshot.capturedAt).toBe("2026-09-16T09:00:00.000Z");
    expect(all[1].snapshot.capturedAt).toBe("2026-09-16T09:15:00.000Z");
    expect(all.every((s) => s.snapshot.token.chainId === 4663)).toBe(true);
  });

  it("persists across a fresh PostgresHistoryStore instance against the same database — proving real durability, not process-local caching", async () => {
    const t1 = "2026-09-16T12:00:00.000Z";
    const snapshot = makeSnapshot({ capturedAt: t1, address: "0x2222222222222222222222222222222222222b" });
    await store.recordScan({ snapshot, report: fakeReport });

    // A brand-new store instance, sharing nothing in-process with `store` — if this
    // finds the row, the data really is in Postgres, not just held in a JS object.
    const freshStore = new PostgresHistoryStore(DATABASE_URL!);
    const found = await freshStore.getPreviousSnapshot(snapshot.token, "2026-09-16T13:00:00.000Z");
    expect(found?.snapshot.capturedAt).toBe(t1);
    await freshStore.close();
  });

  it("round-trips the full ScanRecord (snapshot + report) through JSONB without dropping fields", async () => {
    const snapshot = makeSnapshot({ address: "0x3333333333333333333333333333333333333c" });
    const richReport = { dataQuality: { contract: "PROVIDER_UNAVAILABLE" }, nested: { deep: [1, 2, { x: "y" }] } } as unknown as HoodflowReport;
    await store.recordScan({ snapshot, report: richReport });

    const found = await store.getPreviousSnapshot(snapshot.token, new Date(Date.now() + 60_000).toISOString());
    expect(found?.report).toEqual(richReport);
  });
});
