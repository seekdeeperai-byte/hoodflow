import { resolveEntityMention, SourceQuality, type KnownToken, type SocialObservation } from "@hoodflow/core";
import type { XTweet, XUser } from "./schema.js";

function engagementCount(tweet: XTweet): number | undefined {
  const m = tweet.public_metrics;
  if (!m) return undefined;
  const values = [m.retweet_count, m.reply_count, m.like_count, m.quote_count].filter((v): v is number => v !== undefined);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
}

export function normalizeXTweet(
  tweet: XTweet,
  usersById: Map<string, XUser>,
  target: { contractAddress: string; officialName?: string; symbol?: string },
  knownTokens: KnownToken[],
): SocialObservation | undefined {
  if (!tweet.created_at) return undefined; // cannot place this observation in time — never guessed
  const author = tweet.author_id ? usersById.get(tweet.author_id) : undefined;
  return {
    source: "x",
    observedAt: tweet.created_at,
    authorId: tweet.author_id,
    authorHandle: author?.username,
    // Never inferred from a verification badge alone (X's "verified" reflects a paid
    // subscription tier today, not authenticity) — this codebase has no separate,
    // explicit registry of official social handles per token, so this is honestly
    // UNKNOWN rather than guessed from `verified`. See types/social-news.ts.
    officialClassification: "UNKNOWN",
    text: tweet.text,
    url: tweet.author_id ? `https://x.com/i/web/status/${tweet.id}` : undefined,
    engagementCount: engagementCount(tweet),
    entityMatch: resolveEntityMention(tweet.text, target, knownTokens),
    sourceQuality: SourceQuality.PUBLIC_SOCIAL,
  };
}
