import { createApp } from "./create-app.js";

/**
 * Long-running process entry point (`pnpm --filter @hoodflow/api run start`).
 * All provider/HistoryStore wiring lives in `create-app.ts` so the serverless
 * entry point (`api/index.ts`) runs the identical stack rather than a
 * second, drifting copy of it. This file's only remaining job is to listen.
 */
async function main() {
  const { app, config } = await createApp();
  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
