import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { InMemoryHistoryStore, type HistoryStore } from "@hoodflow/core";
import type { Config } from "./config.js";
import type { PipelineDeps } from "./pipeline.js";
import { registerReportRoute } from "./routes/report.js";
import { registerPulseRoute } from "./routes/pulse.js";
import { buildReadinessReport } from "./health.js";
import { PostgresHistoryStore } from "./history/postgres-history-store.js";

/**
 * Infrastructure probe endpoints. Deliberately exempt from rate limiting
 * (see the `allowList` below) and from the intelligence routes' cache
 * policy — they are cheap, stateless, and read by orchestrators, not users.
 */
const HEALTH_PATHS = new Set(["/healthz", "/liveness", "/readiness"]);

export async function buildApp(
  config: Config,
  deps: PipelineDeps,
  // Defaults to a fresh in-memory store per app instance — fine for a single-process
  // deploy and for tests; a real deployment passes a shared/persistent HistoryStore in.
  // See docs/HISTORY_SCHEMA.md.
  historyStore: HistoryStore = new InMemoryHistoryStore(),
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    // Decides what `request.ip` — and therefore the rate limiter's per-client
    // bucket — is derived from. Off unless explicitly enabled; see the
    // TRUST_PROXY comment in config.ts for why this is configuration and not
    // an auto-detected default.
    trustProxy: config.TRUST_PROXY,
  });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    /**
     * SECURITY HARDENING (2026-09-16), runtime-verified defect: health probes
     * previously consumed the same per-IP budget as the expensive intelligence
     * routes (`x-ratelimit-remaining` was observed decrementing on `/liveness`).
     * A Kubernetes/ECS liveness probe polling even once every two seconds would
     * exhaust the default 30/minute budget and start receiving HTTP 429 — which
     * an orchestrator reads as a failed probe, so it would restart perfectly
     * healthy containers in a loop, and a 429 on `/readiness` would pull healthy
     * instances out of the load balancer. Probe traffic would also starve real
     * user requests sharing that IP bucket (every request behind one NAT/ingress
     * hop). Exempting these three endpoints is safe: they take no user input,
     * touch no provider, run no query, and disclose only non-sensitive
     * configuration *state* (which credential slots are filled, never a value —
     * see health.ts).
     */
    allowList: (req) => HEALTH_PATHS.has(req.url.split("?")[0] ?? ""),
  });

  /**
   * Baseline security + cache headers on every response. Hand-rolled rather
   * than pulling in @fastify/helmet: this is a pure JSON API with no HTML,
   * no cookies, no sessions and no browser-rendered surface of its own, so
   * exactly four static headers are meaningful here and a new dependency
   * (plus its transitive supply-chain surface) would not be justified for
   * them. The frontend's own headers — including CSP, which only matters
   * where HTML is rendered — are set separately in apps/web/next.config.mjs.
   */
  app.addHook("onSend", async (request, reply, payload) => {
    // Stops a browser from MIME-sniffing a JSON body into something executable.
    reply.header("x-content-type-options", "nosniff");
    // This API is never framed; belt-and-braces clickjacking protection even
    // though a JSON response is not a meaningful framing target on its own.
    reply.header("x-frame-options", "DENY");
    // Never leak the full requested URL (which carries the token address being
    // scanned) to a third-party host in a Referer header.
    reply.header("referrer-policy", "no-referrer");
    // Intelligence responses are point-in-time observations carrying their own
    // `dataFreshness`/`generatedAt` provenance. Allowing a shared proxy or CDN
    // to serve a heuristically-cached copy would hand a user stale intelligence
    // under a fresh timestamp — a direct contradiction of this product's own
    // freshness guarantees. Health endpoints get the same treatment so a probe
    // never reads a cached "ok" from a dead instance.
    reply.header("cache-control", "no-store");
    return payload;
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

  /**
   * Explicit 404 handler. Fastify's default replies
   * `{"message":"Route GET:/<raw path> not found","error":"Not Found","statusCode":404}`,
   * which (a) reflects the unmodified request path back to the caller and
   * (b) uses a different body shape from every other error this API returns.
   * Neither is exploitable on its own — the content type is JSON and the body
   * is JSON-escaped — but reflecting attacker-controlled input serves no
   * purpose, and one consistent `{ error, message }` contract is what every
   * client (including apps/web/lib/api.ts) already parses.
   */
  app.setNotFoundHandler((request, reply) => {
    request.log.info({ method: request.method, statusCode: 404 }, "route not found");
    reply.status(404).send({
      error: "NOT_FOUND",
      message: "No such endpoint. See the documented routes in README.md.",
    });
  });

  /**
   * Maps an HTTP status to this API's `error` code. Added because the
   * blanket `statusCode < 500 ? "BAD_REQUEST" : "INTERNAL_ERROR"` rule
   * labelled a rate-limit response `{"error":"BAD_REQUEST"}` — verified at
   * runtime by exhausting the limiter. The request was not malformed, and
   * telling an API consumer it was sends them debugging the wrong thing
   * (the frontend happened to be unaffected because apps/web/lib/api.ts
   * branches on the numeric status, not this field). Status code and error
   * code now agree.
   */
  const errorCodeFor = (statusCode: number): string => {
    if (statusCode === 404) return "NOT_FOUND";
    if (statusCode === 429) return "RATE_LIMITED";
    if (statusCode >= 500) return "INTERNAL_ERROR";
    return "BAD_REQUEST";
  };

  // Centralized error handler: never leak stack traces or internal error
  // messages to the client, and never log secrets (config isn't logged at all).
  app.setErrorHandler((err: FastifyError, request, reply) => {
    request.log.error({ err: err.message, statusCode: err.statusCode }, "unhandled route error");
    const statusCode = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.status(statusCode).send({
      error: errorCodeFor(statusCode),
      // 4xx messages are developer-authored route/plugin strings (e.g. zod
      // validation text, the limiter's retry hint) and are safe to surface.
      // 5xx is always the generic string: an unexpected server error's message
      // can carry internals (a driver error naming a host, a filesystem path),
      // so it stays server-side in the log line above.
      message: statusCode < 500 ? err.message : "An unexpected error occurred.",
    });
  });

  return app;
}
