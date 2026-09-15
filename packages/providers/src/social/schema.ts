import { z } from "zod";

/**
 * X (Twitter) API v2 "recent search" response shape. Docs:
 * https://developer.twitter.com/en/docs/twitter-api/tweets/search/api-reference/get-tweets-search-recent
 * Every field optional per this codebase's standard convention — a field
 * X's API omits is unknown, never defaulted to 0/false.
 */
const XPublicMetricsSchema = z.object({
  retweet_count: z.number().optional(),
  reply_count: z.number().optional(),
  like_count: z.number().optional(),
  quote_count: z.number().optional(),
});

const XTweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  created_at: z.string().optional(),
  author_id: z.string().optional(),
  public_metrics: XPublicMetricsSchema.optional(),
});

const XUserSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  verified: z.boolean().optional(),
});

export const XSearchResponseSchema = z.object({
  data: z.array(XTweetSchema).optional(),
  includes: z.object({ users: z.array(XUserSchema).optional() }).optional(),
  meta: z.object({ result_count: z.number().optional() }).optional(),
  // X's API returns RFC7807-style problem details on error, not the shape above.
  title: z.string().optional(),
  detail: z.string().optional(),
  status: z.number().optional(),
});

export type XTweet = z.infer<typeof XTweetSchema>;
export type XUser = z.infer<typeof XUserSchema>;
export type XSearchResponse = z.infer<typeof XSearchResponseSchema>;
