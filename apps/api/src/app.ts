import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { InMemoryHistoryStore, type HistoryStore } from "@hoodflow/core";
import type { Config } from "./config.js";
import type { PipelineDeps } from "./pipeline.js";
import { registerReportRoute } from "./routes/report.js";
import { registerPulseRoute } from "./routes/pulse.js";
import { buildReadinessReport } from "./health.js";
import { PostgresHistoryStore } from "./history/postgres-history-store.js";

export async function buildApp(
  config: Config,
  deps: PipelineDeps,
  // Defaults to a fresh in-memory store per app instance — fine for a single-process
  // deploy and for tests; a real deployment passes a shared/persistent HistoryStore in.
  // See docs/HISTORY_SCHEMA.md.
  historyStore: HistoryStore = new InMemoryHistoryStore(),
): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });

  // Kept for backward compatibility with any existing external health check
  // config (load balancers, uptime monitors) already pointed at /healthz.
  app.get("/healthz", async () => ({ status: "ok" }));

  // Liveness: is the process alive and able to respond at all? An orchestrator
  // restarts the container on failure here, so this must never depend on
  // anything outside the process itself (see health.ts's doc comment).
  app.get("/liveness", async () => ({ status: "alive" }));

  // Readiness: is this instance ready to serve real traffic right now? Deliberately
  // does NOT gate on GoPlus/DexScreener/Blockscout/GDELT/X reachability — see
  // health.ts for the full rationale. Always 200; `ready` in the body reflects
  // this instance's own startup/wiring state, not third-party dependency health.
  app.get("/readiness", async () =>
    buildReadinessReport({
      social: deps.social,
      goplusApiKey: config.GOPLUS_API_KEY,
      blockscoutApiKey: config.BLOCKSCOUT_API_KEY,
      historyStoreKind: historyStore instanceof PostgresHistoryStore ? "postgres" : "in_memory",
    }),
  );

  registerReportRoute(app, deps, historyStore);
  registerPulseRoute(app, historyStore);

  // Centralized error handler: never leak stack traces or internal error
  // messages to the client, and never log secrets (config isn't logged at all).
  app.setErrorHandler((err: FastifyError, request, reply) => {
    request.log.error({ err: err.message, statusCode: err.statusCode }, "unhandled route error");
    const statusCode = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.status(statusCode).send({
      error: statusCode < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR",
      message: statusCode < 500 ? err.message : "An unexpected error occurred.",
    });
  });

  return app;
}
