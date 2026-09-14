import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildReport } from "@hoodflow/core";
import { getChainConfig, isValidEvmAddress } from "@hoodflow/providers";
import { fetchSnapshot, type PipelineDeps } from "../pipeline.js";

const ParamsSchema = z.object({
  chainId: z.coerce.number().int().positive(),
  address: z.string(),
});

export function registerReportRoute(app: FastifyInstance, deps: PipelineDeps): void {
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
    const report = buildReport(snapshot);
    return reply.status(200).send(report);
  });
}
