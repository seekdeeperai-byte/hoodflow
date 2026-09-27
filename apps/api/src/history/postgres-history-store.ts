From 7145e596d32b1c6bb1fc7b66f25c3199d29e7309 Mon Sep 17 00:00:00 2001
From: Claude Opus 5 <noreply@anthropic.com>
Date: Fri, 25 Sep 2026 19:42:57 +0000
Subject: [PATCH] Fix Postgres serverless schema initialization
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit

Production hotfix. /v1/report and /v1/pulse returned 500 on every request
while /readiness stayed green.

ensureSchema() read the DDL from disk:

  join(__dirname, "..", "..", "migrations", "001_init.sql")

apps/api/vercel.json bundles "dist/**" only, so migrations/001_init.sql does
not exist in the deployed function and readFileSync threw ENOENT before any
query ran. /readiness never touches the history store, which is why it kept
reporting ready:true with history:"postgres" — the store was constructed, just
never usable. hoodflow_scans had 0 rows and had never received an insert.

The DDL is now a constant in the module, so the code path that only ever
needed a string no longer needs a filesystem. Verified by hiding migrations/
to reproduce the deployed bundle: before, ENOENT; after, the call reaches the
database.

Nothing about the schema or the history logic changes. Same table, same
columns, same two indexes, still idempotent (IF NOT EXISTS), same queries.
apps/api/migrations/001_init.sql is kept as the source of truth and carries
the design rationale; the embedded statements were compared against it
statement by statement and are identical.

Also includes the GDELT attribution in News & Context (apps/web/components/
NewsIntelligence.tsx), which production was missing. GDELT grants unlimited
free use on the condition that any use of the data cites the GDELT Project
and links to it, so on a live site this is a licence obligation, not styling.
It renders whether or not news data was available, because the obligation
attaches to using the API at all.

347 tests pass, typecheck clean, all four packages build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TZ9rkb9FpE2BYHpJqrSRRU
---
 .../api/src/history/postgres-history-store.ts | 40 +++++++++++++++----
 apps/web/components/NewsIntelligence.tsx      | 24 +++++++++++
 2 files changed, 57 insertions(+), 7 deletions(-)

diff --git a/apps/api/src/history/postgres-history-store.ts b/apps/api/src/history/postgres-history-store.ts
index a926b4f..1cb9649 100644
--- a/apps/api/src/history/postgres-history-store.ts
+++ b/apps/api/src/history/postgres-history-store.ts
@@ -1,10 +1,38 @@
-import { readFileSync } from "node:fs";
-import { fileURLToPath } from "node:url";
-import { dirname, join } from "node:path";
 import { Pool, type PoolConfig } from "pg";
 import type { HistoryStore, ScanRecord, TokenIdentity } from "@hoodflow/core";
 
-const __dirname = dirname(fileURLToPath(import.meta.url));
+/**
+ * Schema bootstrap DDL, kept identical to apps/api/migrations/001_init.sql.
+ * That .sql file stays the source of truth and carries the full design
+ * rationale for the single-JSONB-row shape; this constant exists only because
+ * reading it from disk at runtime is not portable.
+ *
+ * `ensureSchema()` previously did `readFileSync(join(__dirname, "..", "..",
+ * "migrations", "001_init.sql"))`. That works from a `tsc` build tree but not
+ * from the deployed Vercel function: apps/api/vercel.json bundles `dist/**`
+ * only, so `migrations/001_init.sql` is absent there and the read threw ENOENT
+ * before any query ran. `/readiness` stayed green because it never touches the
+ * store, while every route that does — /v1/report and /v1/pulse — returned
+ * 500. Inlining the statements removes a filesystem dependency from a code
+ * path that only ever needed a string. The statements themselves are
+ * unchanged: same table, same columns, same two indexes, still idempotent.
+ */
+const SCHEMA_DDL = `
+CREATE TABLE IF NOT EXISTS hoodflow_scans (
+  id BIGSERIAL PRIMARY KEY,
+  chain_id INTEGER NOT NULL,
+  address TEXT NOT NULL,
+  captured_at TIMESTAMPTZ NOT NULL,
+  scan_record JSONB NOT NULL,
+  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
+);
+
+CREATE INDEX IF NOT EXISTS hoodflow_scans_token_time_idx
+  ON hoodflow_scans (chain_id, address, captured_at);
+
+CREATE INDEX IF NOT EXISTS hoodflow_scans_chain_time_idx
+  ON hoodflow_scans (chain_id, captured_at);
+`;
 
 /**
  * Default sink for idle-connection pool errors. Message only — never the
@@ -85,9 +113,7 @@ export class PostgresHistoryStore implements HistoryStore {
   private async ensureSchema(): Promise<void> {
     if (!this.schemaReady) {
       this.schemaReady = (async () => {
-        const migrationPath = join(__dirname, "..", "..", "migrations", "001_init.sql");
-        const sql = readFileSync(migrationPath, "utf-8");
-        await this.pool.query(sql);
+        await this.pool.query(SCHEMA_DDL);
       })();
       // A failed schema bootstrap must not be cached as a permanently-rejected
       // promise: if the database was merely unreachable at startup, the next
diff --git a/apps/web/components/NewsIntelligence.tsx b/apps/web/components/NewsIntelligence.tsx
index 76e8ddf..858e842 100644
--- a/apps/web/components/NewsIntelligence.tsx
+++ b/apps/web/components/NewsIntelligence.tsx
@@ -71,6 +71,30 @@ export function NewsIntelligence({ report }: { report: HoodflowReport }) {
           )}
         </>
       )}
+
+      {/*
+       * REQUIRED ATTRIBUTION — not decoration. GDELT's own terms
+       * (https://www.gdeltproject.org/about.html) grant unlimited free use
+       * "for any academic, commercial, or governmental use of any kind
+       * without fee", on one condition: "any use or redistribution of the
+       * data must include a citation to the GDELT Project and a link to this
+       * website." News & Context is built entirely on GDELT DOC 2.0, so this
+       * line is a licence obligation and must not be removed while that
+       * provider is in use. It renders whether or not data was available,
+       * because the obligation attaches to using the API at all.
+       *
+       * Note on scope: HOODFLOW stores and displays only GDELT's article
+       * *metadata* (publisher domain, headline, timestamp, link) — never
+       * article bodies — so it does not republish news content itself. See
+       * packages/providers/src/news/normalize.ts.
+       */}
+      <p className={styles.muted} style={{ marginTop: 12 }}>
+        News metadata via the{" "}
+        <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer">
+          GDELT Project
+        </a>
+        . HoodFlow shows headlines, publishers and timestamps only — never article text.
+      </p>
     </section>
   );
 }
-- 
2.43.0
