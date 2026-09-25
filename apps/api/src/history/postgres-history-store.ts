import { Pool, type PoolClient } from "pg";
import type { HoodflowReport } from "@hoodflow/core";
import type { HistoryStore } from "./history-store";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS hoodflow_scans (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL,
  report JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS hoodflow_scans_token_time_idx
  ON hoodflow_scans (chain_id, token_address, scanned_at DESC);

CREATE INDEX IF NOT EXISTS hoodflow_scans_chain_time_idx
  ON hoodflow_scans (chain_id, scanned_at DESC);
`;

export class PostgresHistoryStore implements HistoryStore {
  private readonly pool: Pool;
  private initialized = false;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX ?? 5),
    });
  }

  private async ensureSchema(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query(SCHEMA_SQL);
      this.initialized = true;
    } finally {
      client.release();
    }
  }

  async saveScan(report: HoodflowReport): Promise<void> {
    await this.ensureSchema();

    await this.pool.query(
      `
        INSERT INTO hoodflow_scans (
          chain_id,
          token_address,
          scanned_at,
          report
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [
        report.chainId,
        report.address,
        report.observedAt,
        JSON.stringify(report),
      ],
    );
  }

  async getLatestScan(
    chainId: number,
    tokenAddress: string,
  ): Promise<HoodflowReport | null> {
    await this.ensureSchema();

    const result = await this.pool.query<{ report: HoodflowReport }>(
      `
        SELECT report
        FROM hoodflow_scans
        WHERE chain_id = $1
          AND token_address = $2
        ORDER BY scanned_at DESC
        LIMIT 1
      `,
      [chainId, tokenAddress],
    );

    return result.rows[0]?.report ?? null;
  }

  async getScansSince(
    chainId: number,
    tokenAddress: string,
    since: Date,
  ): Promise<HoodflowReport[]> {
    await this.ensureSchema();

    const result = await this.pool.query<{ report: HoodflowReport }>(
      `
        SELECT report
        FROM hoodflow_scans
        WHERE chain_id = $1
          AND token_address = $2
          AND scanned_at >= $3
        ORDER BY scanned_at ASC
      `,
      [chainId, tokenAddress, since],
    );

    return result.rows.map((row) => row.report);
  }

  async getAllScansSince(
    chainId: number,
    since: Date,
  ): Promise<HoodflowReport[]> {
    await this.ensureSchema();

    const result = await this.pool.query<{ report: HoodflowReport }>(
      `
        SELECT report
        FROM hoodflow_scans
        WHERE chain_id = $1
          AND scanned_at >= $2
        ORDER BY scanned_at ASC
      `,
      [chainId, since],
    );

    return result.rows.map((row) => row.report);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
