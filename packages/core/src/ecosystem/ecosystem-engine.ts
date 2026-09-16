import { DataState, isUsable } from "../types/data-state.js";
import { Confidence } from "../types/intelligence.js";
import { RelationshipCategory, type CanonicalRelationship } from "../types/relationship-graph.js";
import { type EntityRef, chainEntity, deployerEntity, liquidityVenueEntity, tokenEntity, tradingPairEntity } from "../types/entities.js";
import type { EcosystemIntelligence } from "../types/ecosystem.js";
import type { ContractSecurityData, LiquiditySnapshot } from "../types/domain.js";

/**
 * Ecosystem Intelligence (FINAL GAP CLOSURE phase §5) — "what is connected
 * to this token?" Deliberately built ONLY from data this pipeline has
 * already fetched (`ContractSecurityData.creatorAddress` from GoPlus,
 * `LiquiditySnapshot.dexId`/`pairAddress` from DexScreener) — no new
 * provider call, no new analyzer for a metric already computed elsewhere
 * (§4.2/§5's own rules, applied here too since ecosystem relationships share
 * that same "reuse, don't duplicate" requirement).
 *
 * Every relationship requires real evidence per-field, never inferred from a
 * name/symbol match alone (§5.4) — the two relationship kinds implemented
 * here (DEPLOYED_BY, TRADES_ON) are both structural on-chain/provider facts,
 * not narrative claims. When neither contract nor liquidity data is usable,
 * this returns `DATA_UNAVAILABLE` with an explicit limitation rather than an
 * empty-but-`AVAILABLE` graph.
 */
export function buildEcosystemIntelligence(input: {
  chainId: number;
  address: string;
  observedAt: string;
  contractState: DataState;
  contract?: ContractSecurityData;
  liquidityState: DataState;
  liquidity?: LiquiditySnapshot;
}): EcosystemIntelligence {
  const { chainId, address, observedAt } = input;
  const subject = tokenEntity(chainId, address);
  const entities: EntityRef[] = [subject, chainEntity(chainId)];
  const relationships: CanonicalRelationship[] = [];
  const limitations: string[] = [];

  const contractUsable = isUsable(input.contractState);
  const liquidityUsable = isUsable(input.liquidityState);

  if (contractUsable && input.contract?.creatorAddress) {
    const creator = deployerEntity(chainId, input.contract.creatorAddress);
    entities.push(creator);
    relationships.push({
      id: `ecosystem-rel:${subject.id}:DEPLOYED_BY:${creator.id}:${observedAt}`,
      category: RelationshipCategory.ECOSYSTEM,
      relationshipType: "DEPLOYED_BY",
      observedAt,
      subject,
      object: creator,
      sourcesInvolved: ["contract"],
      evidence: [`Contract security data reports the on-chain creator address as ${input.contract.creatorAddress}.`],
      // A single provider's self-reported creator field — MEDIUM, never HIGH, same
      // "never HIGH from one source" posture used throughout cross-source/attention.
      confidence: Confidence.MEDIUM,
      dataState: input.contractState,
      interpretation: "This token's contract was deployed by the address shown, per GoPlus Security's contract metadata.",
    });
  } else if (!contractUsable) {
    limitations.push(`Deployer relationship is unavailable — contract security data is unusable this scan (${input.contractState}).`);
  }

  if (liquidityUsable && input.liquidity?.dexId && input.liquidity?.pairAddress) {
    const venue = liquidityVenueEntity(input.liquidity.dexId);
    const pair = tradingPairEntity(chainId, input.liquidity.dexId, input.liquidity.pairAddress);
    entities.push(venue, pair);
    relationships.push({
      id: `ecosystem-rel:${subject.id}:TRADES_ON:${pair.id}:${observedAt}`,
      category: RelationshipCategory.ECOSYSTEM,
      relationshipType: "TRADES_ON",
      observedAt,
      subject,
      object: pair,
      sourcesInvolved: ["liquidity"],
      evidence: [
        `DexScreener reports an active pair (${input.liquidity.pairAddress}) on ${input.liquidity.dexId}` +
          (input.liquidity.liquidityUsd !== undefined ? ` with $${Math.round(input.liquidity.liquidityUsd).toLocaleString("en-US")} pooled liquidity.` : "."),
      ],
      confidence: Confidence.MEDIUM,
      dataState: input.liquidityState,
      interpretation: `This token trades on ${input.liquidity.dexId} through the pair shown, per DexScreener's liquidity data.`,
    });
    relationships.push({
      id: `ecosystem-rel:${subject.id}:PAIRED_WITH:${venue.id}:${observedAt}`,
      category: RelationshipCategory.ECOSYSTEM,
      relationshipType: "LIQUIDITY_CONNECTED_TO",
      observedAt,
      subject,
      object: venue,
      sourcesInvolved: ["liquidity"],
      evidence: [`DexScreener attributes this token's active liquidity pair to the venue ${input.liquidity.dexId}.`],
      confidence: Confidence.MEDIUM,
      dataState: input.liquidityState,
      interpretation: `This token's liquidity is connected to the ${input.liquidity.dexId} venue.`,
    });
  } else if (!liquidityUsable) {
    limitations.push(`Trading-venue relationship is unavailable — liquidity data is unusable this scan (${input.liquidityState}).`);
  }

  const dataState =
    relationships.length > 0
      ? DataState.AVAILABLE
      : !contractUsable && !liquidityUsable
        ? DataState.DATA_UNAVAILABLE
        : DataState.PARTIAL;

  if (relationships.length === 0 && limitations.length === 0) {
    limitations.push("No ecosystem relationship could be established this scan — contract/liquidity data were usable but did not report a creator address or an active trading pair.");
  }

  return { dataState, subject, entities, relationships, limitations };
}
