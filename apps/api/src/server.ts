import { GoPlusClient, DexScreenerClient, BlockscoutClient, GdeltNewsClient, XSocialClient, getChainConfig } from "@hoodflow/providers";
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
  // News (GDELT) needs no credential and is always constructed. Social (X API v2) is
  // constructed either way — passing no bearerToken is exactly what makes it return
  // PROVIDER_UNAVAILABLE without a network call (see XSocialClient's own doc comment).
  const news = new GdeltNewsClient();
  const social = new XSocialClient({ bearerToken: config.X_BEARER_TOKEN });

  const app = await buildApp(config, { goplus, dexscreener, blockscout, blockscoutChainId: 4663, social, news });

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
