import { GoPlusClient, DexScreenerClient, BlockscoutClient, GdeltNewsClient, XSocialClient, getChainConfig } from "@hoodflow/providers";
import { InMemoryHistoryStore, type HistoryStore } from "@hoodflow/core";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { PostgresHistoryStore } from "./history/postgres-history-store.js";

/**
 * Wires the real providers + history store into a ready Fastify app.
 * Shared by the long-running server (server.ts) and the Vercel serverless
 * entry (api/index.js), so both run exactly the same application.
 */
export async function createApp(
  config: Config = loadConfig(),
  options: { trustProxy?: boolean } = {},
): Promise<FastifyInstance> {
  // DATABASE_URL set -> durable Postgres history; unset -> in-memory (lost on restart).
  const historyStore: HistoryStore = config.DATABASE_URL
    ? new PostgresHistoryStore(config.DATABASE_URL)
    : new InMemoryHistoryStore();

  const goplus = new GoPlusClient({ apiKey: config.GOPLUS_API_KEY });
  const dexscreener = new DexScreenerClient();
  // Blockscout is chain-specific; defaults to Robinhood Chain mainnet (4663).
  const blockscout = new BlockscoutClient({
    baseUrl: getChainConfig(4663)!.blockscoutBaseUrl,
    apiKey: config.BLOCKSCOUT_API_KEY,
  });
  // GDELT needs no credential; X without a token reports PROVIDER_UNAVAILABLE without a network call.
  const news = new GdeltNewsClient();
  const social = new XSocialClient({ bearerToken: config.X_BEARER_TOKEN });

  return buildApp(config, { goplus, dexscreener, blockscout, blockscoutChainId: 4663, social, news }, historyStore, options);
}
