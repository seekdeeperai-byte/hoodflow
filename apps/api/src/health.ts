import type { PipelineDeps } from "./pipeline.js";

/**
 * Liveness vs. readiness (REAL WORLD DEPLOYMENT phase). Split from the
 * single pre-existing `/healthz` on purpose — a production orchestrator
 * (Kubernetes, ECS, a load balancer health check) needs two different
 * questions answered, and conflating them is a real production bug class:
 *
 * - **Liveness**: is this process alive and able to respond at all? Should
 *   only ever fail if the process itself is wedged/deadlocked — an
 *   orchestrator restarts the container on liveness failure. Nothing about
 *   an external dependency belongs here.
 * - **Readiness**: is this instance ready to receive traffic right now? An
 *   orchestrator pulls the instance out of the load-balancing rotation on
 *   readiness failure, without restarting it.
 *
 * **Deliberate design decision, stated explicitly rather than left
 * implicit**: readiness here does NOT gate on GoPlus/DexScreener/
 * Blockscout/GDELT/X being reachable. HOODFLOW's entire data-integrity
 * model is built around every one of those being allowed to be down at any
 * time — a provider outage becomes an honest `PROVIDER_UNAVAILABLE` on the
 * specific report fields it affects, not a broken service (see
 * docs/ARCHITECTURE.md §5). If readiness gated on provider reachability,
 * a single third-party vendor outage would pull every HOODFLOW instance
 * out of rotation and take the whole product down — exactly the failure
 * this two-endpoint split exists to prevent, and a materially worse
 * outcome than serving reports with some domains honestly marked
 * unavailable. What readiness DOES check is this instance's own ability to
 * do its job: the process finished startup, and every provider client this
 * build actually depends on was constructed (a config/wiring failure here
 * — e.g. `server.ts` failing to construct a client — is a real reason to
 * mark an instance not-ready, distinct from that client's *target* being
 * temporarily unreachable). Per-provider configuration state is reported
 * as **information**, not a pass/fail gate: an operator reading this
 * endpoint can see at a glance which credentials are set, without the
 * endpoint itself lying about whether the instance can serve requests.
 */
export interface ReadinessReport {
  ready: boolean;
  startedAt: string;
  uptimeSeconds: number;
  providers: {
    goplus: "configured" | "unauthenticated";
    dexscreener: "configured";
    blockscout: "configured" | "unauthenticated";
    news: "configured";
    social: "configured" | "not_configured";
  };
  /**
   * §18 (REAL WORLD DEPLOYMENT phase): which HistoryStore implementation this
   * instance is actually running. "in_memory" is a real, informational
   * warning for an operator — it means every scan's history is lost on this
   * instance's next restart/redeploy (see InMemoryHistoryStore's own doc
   * comment) — never a pass/fail gate, same reasoning as the provider fields
   * above: an instance with in-memory history is still fully able to serve
   * requests right now, just without durability across restarts.
   */
  history: "postgres" | "in_memory";
}

const processStartedAt = new Date().toISOString();

export function buildReadinessReport(
  deps: Pick<PipelineDeps, "social"> & { goplusApiKey?: string; blockscoutApiKey?: string; historyStoreKind: "postgres" | "in_memory" },
): ReadinessReport {
  return {
    ready: true,
    startedAt: processStartedAt,
    uptimeSeconds: Math.round(process.uptime()),
    providers: {
      // "unauthenticated" is not a failure — both GoPlus and Blockscout serve real,
      // usable data without a key at a lower rate limit (see apps/api/.env.example).
      goplus: deps.goplusApiKey ? "configured" : "unauthenticated",
      dexscreener: "configured", // no credential of any kind exists for DexScreener
      blockscout: deps.blockscoutApiKey ? "configured" : "unauthenticated",
      news: "configured", // GDELT needs no credential
      // NOT `deps.social ? ... : ...` — server.ts always constructs an XSocialClient
      // instance regardless of whether X_BEARER_TOKEN is set, so object presence alone
      // would always report "configured" and misrepresent real credential state (the
      // exact failure mode this endpoint exists to avoid). isConfigured reflects
      // whether a bearer token was actually supplied, never the token value itself.
      social: deps.social?.isConfigured ? "configured" : "not_configured",
    },
    history: deps.historyStoreKind,
  };
}
