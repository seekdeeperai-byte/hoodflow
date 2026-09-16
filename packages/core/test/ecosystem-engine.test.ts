import { describe, expect, it } from "vitest";
import { buildEcosystemIntelligence } from "../src/ecosystem/ecosystem-engine.js";
import { DataState } from "../src/types/data-state.js";
import { EntityType } from "../src/types/entities.js";

const NOW = "2026-09-16T12:00:00.000Z";
const CHAIN_ID = 4663;
const ADDRESS = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

describe("buildEcosystemIntelligence", () => {
  it("reports DATA_UNAVAILABLE with no fabricated entities when both contract and liquidity data are unusable (the real sandbox outcome)", () => {
    const result = buildEcosystemIntelligence({
      chainId: CHAIN_ID,
      address: ADDRESS,
      observedAt: NOW,
      contractState: DataState.PROVIDER_UNAVAILABLE,
      liquidityState: DataState.PROVIDER_UNAVAILABLE,
    });
    expect(result.dataState).toBe(DataState.DATA_UNAVAILABLE);
    expect(result.relationships).toHaveLength(0);
    // Only the token itself and its chain are ever asserted without evidence.
    expect(result.entities).toHaveLength(2);
    expect(result.entities.some((e) => e.entityType === EntityType.DEPLOYER)).toBe(false);
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("emits a DEPLOYED_BY relationship, never inferred, only when a real creatorAddress was reported", () => {
    const result = buildEcosystemIntelligence({
      chainId: CHAIN_ID,
      address: ADDRESS,
      observedAt: NOW,
      contractState: DataState.AVAILABLE,
      contract: { creatorAddress: "0xAbCdEf0000000000000000000000000000AbCd" },
      liquidityState: DataState.PROVIDER_UNAVAILABLE,
    });
    const rel = result.relationships.find((r) => r.relationshipType === "DEPLOYED_BY");
    expect(rel).toBeDefined();
    expect(rel?.object?.entityType).toBe(EntityType.DEPLOYER);
    expect(rel?.object?.id).toBe(`deployer:${CHAIN_ID}:0xabcdef0000000000000000000000000000abcd`);
    expect(rel?.confidence).not.toBe("HIGH"); // single-provider self-reported fact — never HIGH
    expect(rel?.dataState).toBe(DataState.AVAILABLE);
    expect(result.dataState).toBe(DataState.AVAILABLE);
  });

  it("does not emit a DEPLOYED_BY relationship when contract data is usable but reports no creatorAddress", () => {
    const result = buildEcosystemIntelligence({
      chainId: CHAIN_ID,
      address: ADDRESS,
      observedAt: NOW,
      contractState: DataState.AVAILABLE,
      contract: {},
      liquidityState: DataState.PROVIDER_UNAVAILABLE,
    });
    expect(result.relationships.some((r) => r.relationshipType === "DEPLOYED_BY")).toBe(false);
  });

  it("emits TRADES_ON and LIQUIDITY_CONNECTED_TO relationships only when a real dexId + pairAddress were reported", () => {
    const result = buildEcosystemIntelligence({
      chainId: CHAIN_ID,
      address: ADDRESS,
      observedAt: NOW,
      contractState: DataState.PROVIDER_UNAVAILABLE,
      liquidityState: DataState.AVAILABLE,
      liquidity: { dexId: "uniswap-v3", pairAddress: "0x1111111111111111111111111111111111111111", liquidityUsd: 178000 },
    });
    expect(result.relationships.find((r) => r.relationshipType === "TRADES_ON")).toBeDefined();
    expect(result.relationships.find((r) => r.relationshipType === "LIQUIDITY_CONNECTED_TO")).toBeDefined();
    expect(result.entities.some((e) => e.entityType === EntityType.TRADING_PAIR)).toBe(true);
    expect(result.entities.some((e) => e.entityType === EntityType.LIQUIDITY_VENUE)).toBe(true);
  });

  it("never fabricates a relationship from name/symbol alone — no entity beyond token/chain appears without a structural evidence field", () => {
    const result = buildEcosystemIntelligence({
      chainId: CHAIN_ID,
      address: ADDRESS,
      observedAt: NOW,
      contractState: DataState.AVAILABLE,
      contract: { observedName: "Global Dollar", observedSymbol: "USDG" }, // name/symbol present, no creatorAddress
      liquidityState: DataState.AVAILABLE,
      liquidity: { observedName: "Global Dollar", observedSymbol: "USDG" }, // no dexId/pairAddress
    });
    expect(result.relationships).toHaveLength(0);
    expect(result.entities).toHaveLength(2); // token + chain only
  });

  it("scopes deployer entity ids by chain — the same creator address on two different chains never collides", () => {
    const a = buildEcosystemIntelligence({
      chainId: 4663,
      address: ADDRESS,
      observedAt: NOW,
      contractState: DataState.AVAILABLE,
      contract: { creatorAddress: "0xAbCdEf0000000000000000000000000000AbCd" },
      liquidityState: DataState.PROVIDER_UNAVAILABLE,
    });
    const b = buildEcosystemIntelligence({
      chainId: 46630,
      address: ADDRESS,
      observedAt: NOW,
      contractState: DataState.AVAILABLE,
      contract: { creatorAddress: "0xAbCdEf0000000000000000000000000000AbCd" },
      liquidityState: DataState.PROVIDER_UNAVAILABLE,
    });
    const deployerA = a.entities.find((e) => e.entityType === EntityType.DEPLOYER);
    const deployerB = b.entities.find((e) => e.entityType === EntityType.DEPLOYER);
    expect(deployerA?.id).not.toBe(deployerB?.id);
  });
});
