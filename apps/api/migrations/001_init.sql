-- HOODFLOW durable history store — real production migration for
-- PostgresHistoryStore (apps/api/src/history/postgres-history-store.ts).
--
-- Design choice, stated explicitly: docs/HISTORY_SCHEMA.md sketches a fully
-- normalized relational schema (separate scan/provider_observation/
-- liquidity_snapshot/holder_snapshot/signal tables). This migration
-- deliberately does NOT implement that. Instead each scan is stored as one
-- row holding the complete, already-validated `ScanRecord` (`{ snapshot,
-- report }`) as JSONB. Reasoning:
--
--   1. HOODFLOW's core product principle is that data must never be
--      silently dropped, reshaped, or misrepresented (see docs/ARCHITECTURE.md
--      §5 — "missing != zero", etc.). A hand-maintained column mapping for a
--      report shape this rich is real surface area for exactly that failure
--      mode: a field added to HoodflowReport in a future phase that nobody
--      remembers to also add a column for would be silently lost on
--      read-back from Postgres, with no error — a correctness bug that's
--      hard to detect and directly contradicts the product's own guarantee.
--      Storing the full validated record verbatim makes that class of bug
--      structurally impossible.
--   2. The three read patterns the HistoryStore interface actually needs
--      (previous-scan lookup, scans-since for one token, scans-since for an
--      entire chain) are all satisfied by indexing on (chain_id, address,
--      captured_at) — they don't need per-field SQL columns.
--   3. This keeps the HistoryStore *interface* (packages/core) completely
--      unchanged and reuses it as the only history abstraction in the
--      codebase, per the explicit constraint against building a second
--      history architecture.
--
-- The normalized schema in docs/HISTORY_SCHEMA.md remains a valid future
-- option if direct SQL analytics over specific fields (e.g. "average
-- liquidity_usd across all scans") is ever needed — that's an additive
-- migration on top of this one, not a replacement for it.

CREATE TABLE IF NOT EXISTS hoodflow_scans (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL, -- always lowercase — enforced by PostgresHistoryStore, never trusted from JSONB alone
  captured_at TIMESTAMPTZ NOT NULL,
  scan_record JSONB NOT NULL, -- the full, unmodified { snapshot, report } — see rationale above
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serves getPreviousSnapshot (chain_id, address, captured_at < X, ORDER BY captured_at DESC LIMIT 1)
-- and getScansSince (chain_id, address, captured_at >= X, ORDER BY captured_at ASC).
CREATE INDEX IF NOT EXISTS hoodflow_scans_token_time_idx
  ON hoodflow_scans (chain_id, address, captured_at);

-- Serves getAllScansSince (chain_id, captured_at >= X, ORDER BY captured_at ASC), which scans across
-- every token on a chain for Robinhood Ecosystem Pulse — see docs/ROBINHOOD_ECOSYSTEM_PULSE.md.
CREATE INDEX IF NOT EXISTS hoodflow_scans_chain_time_idx
  ON hoodflow_scans (chain_id, captured_at);
