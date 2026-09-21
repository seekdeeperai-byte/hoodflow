import { createApp } from "./create-app.js";
import { loadConfig } from "./config.js";

async function main() {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
