import { GoPlusClient, DexScreenerClient, BlockscoutClient, GdeltNewsClient, XSocialClient, getChainConfig } from "@hoodflow/providers";
import { InMemoryHistoryStore, type HistoryStore } from "@hoodflow/core";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { PostgresHistoryStore } from "./history/postgres-history-store.js";

/**
 * The one place the real provider clients and the concrete HistoryStore are
 * wired together. Extracted from `server.ts` (which previously held this
 * inline) so that a second entry point can reuse the *identical* wiring
 * instead of maintaining a divergent copy of it — see `api/index.ts`, the
 * serverless handler used by the Vercel deployment.
 *
 * `server.ts` still owns listening on a port; this function deliberately
 * does not listen, so it is equally usable from a long-running process and
 * from a request-scoped serverless invocation.
 */
export async function createApp(config: Config = loadConfig()): Promise<{ app: FastifyInstance; config: Config }> {
  /**
   * Durable history: DATABASE_URL configured -> Postgres-backed, real
   * persistence. Unset -> InMemoryHistoryStore.
   *
   * Deployment note, important on serverless: in-memory history is not just
   * "lost on restart" there — each invocation can be a fresh instance, so the
   * store is effectively always empty and every scan would report
   * INSUFFICIENT_HISTORY forever. "What changed", temporal relationships and
   * the Ecosystem Pulse all depend on a real prior observation, so a
   * serverless deployment needs DATABASE_URL to be more than a live snapshot
   * viewer. The app still runs correctly without it — it just cannot
   * accumulate history, and says so honestly rather than pretending.
   */
  const historyStore: HistoryStore = config.DATABASE_URL
    ? new PostgresHistoryStore({ connectionString: config.DATABASE_URL, max: config.PG_POOL_MAX })
    : new InMemoryHistoryStore();

  const goplus = new GoPlusClient({ apiKey: config.GOPLUS_API_KEY });
  const dexscreener = new DexScreenerClient();
  // Blockscout is chain-specific; default to Robinhood Chain mainnet for this
  // vertical slice. A multi-chain build routes to the right base URL per
  // request instead of hardcoding one client (tracked in docs/ROADMAP.md).
  const blockscout = new BlockscoutClient({
    baseUrl: getChainConfig(4663)!.blockscoutBaseUrl,
    apiKey: config.BLOCKSCOUT_API_KEY,
  });
  // News (GDELT) needs no credential and is always constructed. Social (X API v2) is
  // constructed either way — passing no bearerToken is exactly what makes it return
  // PROVIDER_UNAVAILABLE without a network call (see XSocialClient's own doc comment).
  const news = new GdeltNewsClient();
  const social = new XSocialClient({ bearerToken: config.X_BEARER_TOKEN });

  const app = await buildApp(config, { goplus, dexscreener, blockscout, blockscoutChainId: 4663, social, news }, historyStore);
  return { app, config };
}
