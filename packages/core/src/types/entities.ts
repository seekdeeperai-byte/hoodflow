/**
 * Canonical entity model (FINAL GAP CLOSURE phase). Shared by the canonical
 * relationship graph (relationships/canonical.ts), Ecosystem Intelligence
 * (ecosystem/ecosystem-engine.ts), and Intelligence Events
 * (events/event-engine.ts) — one entity-identity scheme reused everywhere,
 * not three ad hoc ones.
 *
 * Every `EntityRef.id` is a stable, chain-aware, normalized string —
 * "chain-aware" specifically so the same address on two different chains
 * never collides (the exact failure mode §5.5/§9's "no accidental
 * cross-chain collisions" warns about), and "normalized" so the same
 * address in different casing never produces two different entities.
 */

export const EntityType = {
  TOKEN: "TOKEN",
  CONTRACT: "CONTRACT",
  WALLET: "WALLET",
  DEPLOYER: "DEPLOYER",
  LIQUIDITY_VENUE: "LIQUIDITY_VENUE",
  TRADING_PAIR: "TRADING_PAIR",
  CHAIN: "CHAIN",
  NEWS_SOURCE: "NEWS_SOURCE",
  SOCIAL_SOURCE: "SOCIAL_SOURCE",
  INTELLIGENCE_EVENT: "INTELLIGENCE_EVENT",
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export interface EntityRef {
  entityType: EntityType;
  /** Stable, chain-aware, normalized identifier — never a bare name/symbol (see docs/ECOSYSTEM_INTELLIGENCE.md §Entity identity). */
  id: string;
  label?: string;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function chainEntity(chainId: number): EntityRef {
  return { entityType: EntityType.CHAIN, id: `chain:${chainId}`, label: `Chain ${chainId}` };
}

export function tokenEntity(chainId: number, address: string, label?: string): EntityRef {
  return { entityType: EntityType.TOKEN, id: `token:${chainId}:${normalizeAddress(address)}`, label };
}

export function contractEntity(chainId: number, address: string): EntityRef {
  return { entityType: EntityType.CONTRACT, id: `contract:${chainId}:${normalizeAddress(address)}` };
}

/** A deployer entity is scoped to the chain it was observed on — the same address on two chains is never treated as the same deployer without independent evidence. */
export function deployerEntity(chainId: number, creatorAddress: string): EntityRef {
  const normalized = normalizeAddress(creatorAddress);
  return { entityType: EntityType.DEPLOYER, id: `deployer:${chainId}:${normalized}`, label: normalized };
}

export function liquidityVenueEntity(dexId: string): EntityRef {
  const normalized = dexId.toLowerCase();
  return { entityType: EntityType.LIQUIDITY_VENUE, id: `venue:${normalized}`, label: dexId };
}

export function tradingPairEntity(chainId: number, dexId: string, pairAddress: string): EntityRef {
  const normalized = `${dexId.toLowerCase()}:${normalizeAddress(pairAddress)}`;
  return { entityType: EntityType.TRADING_PAIR, id: `pair:${chainId}:${normalized}`, label: pairAddress };
}

export function newsSourceEntity(source: string): EntityRef {
  const normalized = source.toLowerCase();
  return { entityType: EntityType.NEWS_SOURCE, id: `news-source:${normalized}`, label: source };
}

export function socialSourceEntity(handle: string): EntityRef {
  const normalized = handle.toLowerCase();
  return { entityType: EntityType.SOCIAL_SOURCE, id: `social-source:${normalized}`, label: handle };
}

export function eventEntity(eventId: string): EntityRef {
  return { entityType: EntityType.INTELLIGENCE_EVENT, id: `event:${eventId}` };
}

export function entityRefEquals(a: EntityRef, b: EntityRef): boolean {
  return a.entityType === b.entityType && a.id === b.id;
}
