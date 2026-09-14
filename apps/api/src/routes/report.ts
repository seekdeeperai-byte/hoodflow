import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildReport, type HistoryStore } from "@hoodflow/core";
import { getChainConfig, isValidEvmAddress } from "@hoodflow/providers";
import { fetchSnapshot, type PipelineDeps } from "../pipeline.js";

const ParamsSchema = z.object({
  chainId: z.coerce.number().int().positive(),
  address: z.string(),
});

export function registerReportRoute(app: FastifyInstance, deps: PipelineDeps, historyStore: HistoryStore): void {
  app.get("/v1/report/:chainId/:address", async (request, reply) => {
    const parsedParams = ParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "chainId and address are required." });
    }
    const { chainId, address } = parsedParams.data;

    if (!isValidEvmAddress(address)) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "address is not a well-formed EVM address." });
    }

    const chain = getChainConfig(chainId);
    if (!chain) {
      return reply.status(404).send({
        error: "UNSUPPORTED_CHAIN",
        message: `Chain id ${chainId} is not in HOODFLOW's chain registry yet.`,
      });
    }

    request.log.info({ chainId, addressPrefix: address.slice(0, 10) }, "building report");

    const snapshot = await fetchSnapshot(deps, chainId, address);

    // Historical comparison: look up the most recent prior scan for this exact token
    // (see docs/HISTORY_SCHEMA.md). Never fabricated — if there isn't one, buildReport
    // is told nothing to compare against and HOLDER_GROWTH simply doesn't appear.
    const previous = await historyStore.getPreviousSnapshot(snapshot.token, snapshot.capturedAt);
    const previousHolderCount = previous?.snapshot.holders.data?.holderCount;

    const report = buildReport(snapshot, { previousHolderCount });
    await historyStore.recordScan({ snapshot, report });

    return reply.status(200).send(report);
  });
}
