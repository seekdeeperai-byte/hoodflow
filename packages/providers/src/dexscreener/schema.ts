import { z } from "zod";

/**
 * DexScreener pair object, per https://docs.dexscreener.com/api/reference.
 * All numeric fields are genuinely optional in practice (a brand-new pair
 * may be missing volume/priceChange buckets), so this schema treats them as
 * optional rather than rejecting a real, partial response.
 */
const TimeBuckets = z.object({
  m5: z.number().optional(),
  h1: z.number().optional(),
  h6: z.number().optional(),
  h24: z.number().optional(),
});

const TxnBuckets = z.object({
  m5: z.object({ buys: z.number().optional(), sells: z.number().optional() }).optional(),
  h1: z.object({ buys: z.number().optional(), sells: z.number().optional() }).optional(),
  h6: z.object({ buys: z.number().optional(), sells: z.number().optional() }).optional(),
  h24: z.object({ buys: z.number().optional(), sells: z.number().optional() }).optional(),
});

export const DexScreenerPairSchema = z.object({
  chainId: z.string().optional(),
  dexId: z.string().optional(),
  pairAddress: z.string().optional(),
  baseToken: z.object({ address: z.string(), name: z.string().optional(), symbol: z.string().optional() }).optional(),
  priceUsd: z.string().optional(),
  txns: TxnBuckets.optional(),
  volume: TimeBuckets.optional(),
  priceChange: TimeBuckets.optional(),
  liquidity: z.object({ usd: z.number().optional(), base: z.number().optional(), quote: z.number().optional() }).optional(),
  fdv: z.number().optional(),
  marketCap: z.number().optional(),
  pairCreatedAt: z.number().optional(),
});

export const DexScreenerPairsResponseSchema = z.union([
  z.array(DexScreenerPairSchema),
  z.object({ pairs: z.array(DexScreenerPairSchema).nullable().optional() }),
]);

export type DexScreenerPair = z.infer<typeof DexScreenerPairSchema>;
