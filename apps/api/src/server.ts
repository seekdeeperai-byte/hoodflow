import { GoPlusClient, DexScreenerClient, BlockscoutClient, getChainConfig } from "@hoodflow/providers";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main() {
  const config = loadConfig();

  const goplus = new GoPlusClient({ apiKey: config.GOPLUS_API_KEY });
  const dexscreener = new DexScreenerClient();
  // Blockscout is chain-specific; default to Robinhood Chain mainnet for this
  // vertical slice. A multi-chain build routes to the right base URL per
  // request instead of hardcoding one client (tracked in docs/ROADMAP.md).
  const blockscout = new BlockscoutClient({
    baseUrl: getChainConfig(4663)!.blockscoutBaseUrl,
    apiKey: config.BLOCKSCOUT_API_KEY,
  });

  const app = await buildApp(config, { goplus, dexscreener, blockscout, blockscoutChainId: 4663 });

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
