import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildEcosystemPulse, type HistoryStore, type PulseWindow } from "@hoodflow/core";
import { getChainConfig } from "@hoodflow/providers";

const ParamsSchema = z.object({ chainId: z.coerce.number().int().positive() });
const QuerySchema = z.object({ window: z.enum(["1h", "6h", "24h", "7d", "30d"]).default("24h") });

/**
 * Robinhood Ecosystem Pulse (FINAL GAP CLOSURE phase §6) — chain-level,
 * additive to the token-level `/v1/report/:chainId/:address` route above.
 * Reads ONLY from the same `HistoryStore` that route already writes to
 * (`historyStore.getAllScansSince`, new this phase — see
 * packages/core/src/history/history-store.ts) — there is no second store,
 * no background scanner, no scheduled job pretending to have ecosystem-wide
 * coverage this build doesn't actually have. When no tokens on this chain
 * have been scanned inside the window, the Pulse honestly reports
 * `DATA_UNAVAILABLE` on every dimension (see docs/ROBINHOOD_ECOSYSTEM_PULSE.md)
 * rather than fabricating ecosystem activity.
 */
const WINDOW_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function registerPulseRoute(app: FastifyInstance, historyStore: HistoryStore): void {
  app.get("/v1/pulse/:chainId", async (request, reply) => {
    const parsedParams = ParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "chainId is required." });
    }
    const parsedQuery = QuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "window must be one of 1h, 6h, 24h, 7d, 30d." });
    }

    const { chainId } = parsedParams.data;
    const { window } = parsedQuery.data;

    const chain = getChainConfig(chainId);
    if (!chain) {
      return reply.status(404).send({
        error: "UNSUPPORTED_CHAIN",
        message: `Chain id ${chainId} is not in HOODFLOW's chain registry yet.`,
      });
    }

    request.log.info({ chainId, window }, "building ecosystem pulse");

    const generatedAt = new Date().toISOString();
    const windowMs = WINDOW_MS[window]!;
    const windowStartedAt = new Date(Date.parse(generatedAt) - windowMs).toISOString();

    const scans = await historyStore.getAllScansSince(chainId, windowStartedAt);

    const pulse = buildEcosystemPulse({
      chainId,
      chainName: chain.name,
      registrySize: chain.knownTokens.length,
      window: window as PulseWindow,
      windowStartedAt,
      windowEndedAt: generatedAt,
      generatedAt,
      scans,
    });

    return reply.status(200).send(pulse);
  });
}
