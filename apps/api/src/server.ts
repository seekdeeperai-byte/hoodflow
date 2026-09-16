import { GoPlusClient, DexScreenerClient, BlockscoutClient, GdeltNewsClient, XSocialClient, getChainConfig } from "@hoodflow/providers";
import { InMemoryHistoryStore, type HistoryStore } from "@hoodflow/core";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PostgresHistoryStore } from "./history/postgres-history-store.js";

async function main() {
  const config = loadConfig();

  // Durable history (§18): DATABASE_URL configured -> Postgres-backed, real
  // persistence across restarts. Unset -> the same InMemoryHistoryStore this
  // build has always defaulted to (lost on restart, single-process only —
  // see InMemoryHistoryStore's own doc comment). This is the one place a
  // concrete HistoryStore implementation is chosen; nothing else in the
  // codebase needs to know or care which one is in use.
  const historyStore: HistoryStore = config.DATABASE_URL
    ? new PostgresHistoryStore(config.DATABASE_URL)
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

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
