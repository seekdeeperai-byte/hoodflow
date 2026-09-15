import { DataState, isUsable } from "../types/data-state.js";
import { Confidence, Direction, type Signal, SignalType, Strength } from "../types/intelligence.js";
import { EntityMatchBasis, type SocialObservation, type SocialSummary } from "../types/social-news.js";

const MIN_WINDOW_HOURS = 0.25; // below this, a velocity figure would be dominated by fetch-timing noise, not real posting rate

function windowHours(start: string | undefined, end: string | undefined): number | undefined {
  if (!start || !end) return undefined;
  const hrs = (Date.parse(end) - Date.parse(start)) / (1000 * 60 * 60);
  if (!Number.isFinite(hrs) || hrs < MIN_WINDOW_HOURS) return undefined;
  return hrs;
}

/**
 * Aggregates already-fetched, already-entity-matched social observations
 * into a `SocialSummary` plus a small set of Signals. Pure, no I/O — mirrors
 * every other analyzer in packages/core/src/analyzers/. Entity matching
 * itself happens upstream (packages/providers/src/social/normalize.ts, via
 * identity/resolve-entity-mention.ts) because it needs the resolved token
 * identity, which this function does not take as an input; this function
 * only aggregates observations that already arrived pre-classified.
 *
 * `dataState` is threaded through unchanged from the provider — this
 * function never upgrades PROVIDER_UNAVAILABLE/RATE_LIMITED/etc. into
 * AVAILABLE just because `observations` happens to be a non-empty array
 * from a prior call, and it never treats an empty (but AVAILABLE) result as
 * "quiet" without saying so explicitly in `limitations`.
 */
export function analyzeSocial(
  observations: SocialObservation[] | undefined,
  dataState: DataState,
  options: { previousSummary?: SocialSummary; now?: string } = {},
): { summary: SocialSummary; signals: Signal[] } {
  const now = options.now ?? new Date().toISOString();

  if (!isUsable(dataState) || observations === undefined) {
    return {
      summary: {
        dataState,
        observations: [],
        limitations: [`Social data unavailable (${dataState}) — this means the provider could not be reached or authorized, not that social activity is low.`],
      },
      signals: [],
    };
  }

  const matched = observations.filter((o) => o.entityMatch.basis !== EntityMatchBasis.NO_MATCH);
  const limitations: string[] = [];
  if (matched.length < observations.length) {
    limitations.push(
      `${observations.length - matched.length} fetched post(s) did not match this token by contract address, official name, or unambiguous symbol and were excluded.`,
    );
  }
  const ambiguous = matched.filter((o) => o.entityMatch.basis === EntityMatchBasis.SYMBOL_AMBIGUOUS);
  if (ambiguous.length > 0) {
    limitations.push(
      `${ambiguous.length} matched post(s) were matched only via an ambiguous shared symbol — included, but with lower confidence than a contract-address or official-name match.`,
    );
  }

  const postCount = matched.length;
  const authorIds = new Set(matched.map((o) => o.authorHandle ?? o.authorId).filter((v): v is string => v !== undefined));
  const officialPostCount = matched.filter((o) => o.officialClassification === "OFFICIAL").length;
  const engagementValues = matched.map((o) => o.engagementCount).filter((v): v is number => v !== undefined);
  const totalEngagement = engagementValues.length > 0 ? engagementValues.reduce((a, b) => a + b, 0) : undefined;

  const timestamps = matched.map((o) => o.observedAt).filter((t) => !Number.isNaN(Date.parse(t)));
  const observationWindowStart = timestamps.length > 0 ? timestamps.reduce((a, b) => (a < b ? a : b)) : undefined;
  const observationWindowEnd = timestamps.length > 0 ? timestamps.reduce((a, b) => (a > b ? a : b)) : undefined;
  const hrs = windowHours(observationWindowStart, observationWindowEnd);
  const mentionVelocity = hrs !== undefined && postCount > 0 ? postCount / hrs : undefined;

  const mentionVelocityChange =
    mentionVelocity !== undefined && options.previousSummary?.mentionVelocity !== undefined
      ? mentionVelocity - options.previousSummary.mentionVelocity
      : undefined;

  if (postCount === 0) {
    limitations.push("No matching social posts were found in this observation window — this is a real zero, not a missing measurement.");
  }

  const summary: SocialSummary = {
    dataState,
    observationWindowStart,
    observationWindowEnd,
    postCount,
    uniqueAuthorCount: authorIds.size,
    officialPostCount,
    totalEngagement,
    mentionVelocity,
    mentionVelocityChange,
    observations: matched,
    limitations,
  };

  const signals: Signal[] = [];
  const push = (signalType: SignalType, strength: Strength, confidence: Confidence, evidence: string) => {
    signals.push({ signalType, direction: Direction.NEUTRAL, strength, confidence, source: "social", evidence, timestamp: now });
  };

  if (postCount > 0) {
    push(
      SignalType.SOCIAL_ATTENTION_LEVEL,
      postCount >= 200 ? Strength.HIGH : postCount >= 20 ? Strength.MEDIUM : Strength.LOW,
      Confidence.MEDIUM, // a single scan's sample, never HIGH — same posture as every other single-scan signal in this codebase
      `${postCount} matching social post(s) from ${authorIds.size} unique author(s) observed${
        observationWindowStart && observationWindowEnd ? ` between ${observationWindowStart} and ${observationWindowEnd}` : ""
      }.`,
    );
  }

  if (mentionVelocityChange !== undefined && options.previousSummary?.mentionVelocity !== undefined && options.previousSummary.mentionVelocity > 0) {
    const pctChange = (mentionVelocityChange / options.previousSummary.mentionVelocity) * 100;
    if (Math.abs(pctChange) >= 20) {
      push(
        SignalType.SOCIAL_ATTENTION_ACCELERATION,
        Math.abs(pctChange) >= 100 ? Strength.HIGH : Strength.MEDIUM,
        Confidence.MEDIUM,
        `Mention velocity moved from ${options.previousSummary.mentionVelocity.toFixed(2)}/hr to ${mentionVelocity!.toFixed(2)}/hr since the previous scan (${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(0)}%).`,
      );
    }
  }

  return { summary, signals };
}
