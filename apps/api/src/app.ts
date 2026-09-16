import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { InMemoryHistoryStore, type HistoryStore } from "@hoodflow/core";
import type { Config } from "./config.js";
import type { PipelineDeps } from "./pipeline.js";
import { registerReportRoute } from "./routes/report.js";
import { registerPulseRoute } from "./routes/pulse.js";

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

  app.get("/healthz", async () => ({ status: "ok" }));

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
