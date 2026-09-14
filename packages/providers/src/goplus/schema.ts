import { z } from "zod";

/**
 * GoPlus Token Security API v1 response shape.
 * Docs: https://docs.gopluslabs.io/reference/tokensecurityusingget_1
 * Booleans are transmitted as the strings "0"/"1"; percentages are decimal
 * fractions transmitted as strings (e.g. "0.05" = 5%). Every field is
 * optional in the schema because GoPlus omits fields it has no data for
 * rather than sending nulls — treat "field absent" the same as
 * "unknown," never as false/0.
 */
const zeroOrOne = z.enum(["0", "1"]).optional();
const numericString = z.string().optional();

export const GoPlusHolderSchema = z.object({
  address: z.string().optional(),
  tag: z.string().optional(),
  is_contract: z.union([z.number(), z.string()]).optional(),
  balance: z.string().optional(),
  percent: z.string().optional(),
  is_locked: z.union([z.number(), z.string()]).optional(),
});

export const GoPlusTokenResultSchema = z.object({
  token_name: z.string().optional(),
  token_symbol: z.string().optional(),
  total_supply: numericString,
  is_open_source: zeroOrOne,
  is_proxy: zeroOrOne,
  is_mintable: zeroOrOne,
  owner_address: z.string().optional(),
  can_take_back_ownership: zeroOrOne,
  hidden_owner: zeroOrOne,
  is_honeypot: zeroOrOne,
  is_blacklisted: zeroOrOne,
  is_whitelisted: zeroOrOne,
  is_anti_whale: zeroOrOne,
  transfer_pausable: zeroOrOne,
  trading_cooldown: zeroOrOne,
  slippage_modifiable: zeroOrOne,
  personal_slippage_modifiable: zeroOrOne,
  buy_tax: numericString,
  sell_tax: numericString,
  holder_count: numericString,
  holders: z.array(GoPlusHolderSchema).optional(),
  lp_holder_count: numericString,
  lp_total_supply: numericString,
  creator_address: z.string().optional(),
  creator_percent: numericString,
  selfdestruct: zeroOrOne,
  external_call: zeroOrOne,
});

export const GoPlusResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  result: z.record(z.string(), GoPlusTokenResultSchema).optional(),
});

export type GoPlusTokenResult = z.infer<typeof GoPlusTokenResultSchema>;
export type GoPlusResponse = z.infer<typeof GoPlusResponseSchema>;
