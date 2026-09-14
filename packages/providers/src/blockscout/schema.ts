import { z } from "zod";

/** Blockscout REST API v2 — GET /api/v2/tokens/{address} */
export const BlockscoutTokenSchema = z.object({
  address: z.string().optional(),
  name: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  decimals: z.union([z.string(), z.number()]).nullable().optional(),
  total_supply: z.string().nullable().optional(),
  holders_count: z.union([z.string(), z.number()]).nullable().optional(),
  type: z.string().optional(),
});

/** Blockscout REST API v2 — GET /api/v2/tokens/{address}/holders */
export const BlockscoutHolderSchema = z.object({
  address: z.object({ hash: z.string().optional() }).optional(),
  value: z.string().optional(),
});

export const BlockscoutHoldersResponseSchema = z.object({
  items: z.array(BlockscoutHolderSchema).optional(),
  next_page_params: z.unknown().nullable().optional(),
});

export type BlockscoutToken = z.infer<typeof BlockscoutTokenSchema>;
export type BlockscoutHolder = z.infer<typeof BlockscoutHolderSchema>;
