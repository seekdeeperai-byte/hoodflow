import { isUsable } from "../types/data-state.js";
import { Confidence, HypeState, type HoodflowReport } from "../types/intelligence.js";
import type { AttentionComponents, NewsSummary, SocialSummary } from "../types/social-news.js";

/**
 * Attention/Hype classification (Final Intelligence Completion phase §5).
 * Deterministic, reproducible, and fully exposed: every component that feeds
 * `state`/`score` is returned in `components` (never a hidden black-box
 * number), and every unavailable input stays `undefined` rather than being
 * defaulted to 0 — an unavailable channel lowers `quality`, it never lowers
 * `score` (a low score must mean "measured, and low," not "we couldn't
 * measure it"). Mirrors interpretation/market-state.ts's own pattern: this
 * is a pure classifier over data other analyzers already produced, and (like
 * selectMarketState) it does not emit its own Signal[] — the observational
 * facts underneath it were already signaled by social-analyzer.ts and
 * news-analyzer.ts.
 *
 * NOT a meme score, NOT a buy/sell signal — see docs/HYPE_ATTENTION.md. This
 * function never looks at price, liquidity, or any market-direction data;
 * it only measures observable social/news attention dynamics.
 *
 * HypeState mapping to the governing spec's suggested AttentionState (kept
 * as documentation, not a second enum — see docs/ROADMAP.md history):
 *   QUIET ≈ LOW_ACTIVITY, EMERGING ≈ NORMAL_ACTIVITY,
 *   ACCELERATING ≈ RAPIDLY_ACCELERATING, HIGH_ATTENTION ≈ ELEVATED_ACTIVITY,
 *   EXTREME_ATTENTION (extra granularity beyond the spec's list),
 *   COOLING ≈ DECELERATING, UNKNOWN ≈ INSUFFICIENT_DATA.
 */

const HIGH_POST_COUNT = 200;
const HIGH_STORY_COUNT = 10;
const STRONG_ACCELERATION_PCT = 50;

export function computeAttention(social: SocialSummary, news: NewsSummary): HoodflowReport["hype"] {
  const socialUsable = isUsable(social.dataState);
  const newsUsable = isUsable(news.dataState);
  const usableChannels = (socialUsable ? 1 : 0) + (newsUsable ? 1 : 0);

  const postCount = social.postCount ?? 0;
  const storyCount = news.storyCount ?? 0;

  // mentionVelocityChange (from social-analyzer.ts) is an absolute delta; recover the
  // implied previous velocity algebraically rather than re-deriving it from raw
  // observations, so this engine stays a pure function of the two summaries.
  const previousVelocity =
    social.mentionVelocity !== undefined && social.mentionVelocityChange !== undefined
      ? social.mentionVelocity - social.mentionVelocityChange
      : undefined;
  const accelerationPct =
    previousVelocity !== undefined && previousVelocity > 0 && social.mentionVelocityChange !== undefined
      ? (social.mentionVelocityChange / previousVelocity) * 100
      : undefined;

  const components: AttentionComponents = {
    mentionVelocity: social.mentionVelocity,
    mentionAcceleration: social.mentionVelocityChange,
    newsCoverageVelocity: news.coverageVelocity,
    engagementVelocity:
      social.totalEngagement !== undefined && social.postCount ? social.totalEngagement / social.postCount : undefined,
    socialNewsConvergence:
      usableChannels === 2 ? ((postCount > 0) === (storyCount > 0) ? 1 : 0) : undefined,
  };

  const reasoning: string[] = [];
  reasoning.push(
    socialUsable
      ? `Social data usable: ${postCount} matching post(s)${social.mentionVelocity !== undefined ? `, velocity ${social.mentionVelocity.toFixed(2)}/hr` : ""}.`
      : `Social data unavailable for this scan (${social.dataState}).`,
  );
  reasoning.push(
    newsUsable
      ? `News data usable: ${storyCount} distinct stor${storyCount === 1 ? "y" : "ies"}.`
      : `News data unavailable for this scan (${news.dataState}).`,
  );
  if (accelerationPct !== undefined) {
    reasoning.push(`Social mention velocity changed ${accelerationPct >= 0 ? "+" : ""}${accelerationPct.toFixed(0)}% vs. the previous scan.`);
  }

  if (usableChannels === 0) {
    reasoning.push("Neither social nor news data was available — attention cannot be classified.");
    return { score: null, state: HypeState.UNKNOWN, quality: "UNKNOWN", confirmation: "UNKNOWN", components, reasoning };
  }

  const hasActivity = postCount > 0 || storyCount > 0;
  const highLevel = postCount >= HIGH_POST_COUNT || storyCount >= HIGH_STORY_COUNT;
  const strongAcceleration = accelerationPct !== undefined && accelerationPct >= STRONG_ACCELERATION_PCT;
  const strongCooling = accelerationPct !== undefined && accelerationPct <= -STRONG_ACCELERATION_PCT;

  let state: HypeState;
  if (!hasActivity) {
    state = HypeState.QUIET;
    reasoning.push("Classified QUIET: no matching social posts or news stories were observed in this window.");
  } else if (strongCooling) {
    state = HypeState.COOLING;
    reasoning.push("Classified COOLING: mention velocity dropped by at least 50% since the previous scan.");
  } else if (highLevel && strongAcceleration) {
    state = HypeState.EXTREME_ATTENTION;
    reasoning.push(`Classified EXTREME_ATTENTION: activity is already high (>=${HIGH_POST_COUNT} posts or >=${HIGH_STORY_COUNT} stories) and still accelerating >=50%.`);
  } else if (highLevel) {
    state = HypeState.HIGH_ATTENTION;
    reasoning.push(`Classified HIGH_ATTENTION: activity level is at or above ${HIGH_POST_COUNT} posts or ${HIGH_STORY_COUNT} stories.`);
  } else if (strongAcceleration) {
    state = HypeState.ACCELERATING;
    reasoning.push("Classified ACCELERATING: mention velocity rose by at least 50% since the previous scan.");
  } else {
    state = HypeState.EMERGING;
    reasoning.push("Classified EMERGING: some real activity is present, but neither at a high absolute level nor accelerating sharply.");
  }

  // Documented, reproducible score — never a hidden number. Capped inputs, exposed weights.
  const normalizedPosts = Math.min(postCount / HIGH_POST_COUNT, 1);
  const normalizedStories = Math.min(storyCount / HIGH_STORY_COUNT, 1);
  const accelerationBoost = accelerationPct !== undefined ? Math.max(0, Math.min(accelerationPct / 100, 1)) : 0;
  const score = Math.round((normalizedPosts * 0.5 + normalizedStories * 0.3 + accelerationBoost * 0.2) * 100);

  // Quality: confidence that `state` reflects real attention dynamics, driven purely by how
  // many independent channels actually had usable data — never HIGH from a single scan of a
  // single channel (same "never HIGH from one weak source" rule as cross-source relationships).
  const quality: Confidence = usableChannels === 2 ? Confidence.MEDIUM : Confidence.LOW;

  // Confirmation: do the two channels (when both usable) actually agree that something (or
  // nothing) is happening? Never fabricated when only one channel is usable — there is
  // nothing to cross-confirm against.
  let confirmation: "UNKNOWN" | Confidence;
  if (usableChannels < 2) {
    confirmation = "UNKNOWN";
  } else {
    confirmation = (postCount > 0) === (storyCount > 0) ? Confidence.MEDIUM : Confidence.LOW;
  }

  return { score, state, quality, confirmation, components, reasoning };
}
