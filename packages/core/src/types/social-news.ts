/**
 * Social + News + Attention/Hype types (Final Intelligence Completion phase).
 *
 * These follow the exact conventions already established by types/domain.ts
 * and types/history.ts: every field a real provider might not supply is
 * optional (never defaulted to 0/false/""), and every classification the
 * system cannot support with real data uses an explicit UNKNOWN/
 * INSUFFICIENT_DATA value rather than guessing. See docs/DATA_SOURCES.md for
 * exactly which providers back these types today, and docs/SECURITY.md for
 * why every text field here is untrusted external content, never
 * instructions (no field on these types is ever interpreted as a command,
 * and packages/core has zero rendering/execution of this text — see
 * apps/web's rendering layer for the display-side half of that guarantee).
 */

import type { DataState } from "./data-state.js";

/** How trustworthy/attributable an external source is — independent of whether its content is true. */
export const SourceQuality = {
  OFFICIAL: "OFFICIAL",
  ESTABLISHED_PUBLISHER: "ESTABLISHED_PUBLISHER",
  PUBLIC_SOCIAL: "PUBLIC_SOCIAL",
  UNKNOWN_SOURCE: "UNKNOWN_SOURCE",
} as const;
export type SourceQuality = (typeof SourceQuality)[keyof typeof SourceQuality];

/**
 * How an observation was tied to a specific on-chain entity. Contract
 * address is the strongest anchor; a bare symbol match is never treated as
 * confirmation on its own because tickers collide across chains/projects
 * (see docs/IDENTITY_RESOLUTION.md's GME case study, which this reuses the
 * same "contract beats symbol" principle from). A false match here is worse
 * than no match — see docs/DATA_SOURCES.md §Entity Resolution.
 */
export const EntityMatchBasis = {
  CONTRACT_ADDRESS: "CONTRACT_ADDRESS",
  OFFICIAL_NAME: "OFFICIAL_NAME",
  SYMBOL_UNAMBIGUOUS: "SYMBOL_UNAMBIGUOUS",
  SYMBOL_AMBIGUOUS: "SYMBOL_AMBIGUOUS",
  NO_MATCH: "NO_MATCH",
} as const;
export type EntityMatchBasis = (typeof EntityMatchBasis)[keyof typeof EntityMatchBasis];

export interface EntityMatch {
  basis: EntityMatchBasis;
  /** Plain-language reason, describing only what the matching rule actually checked — never embellished. */
  note: string;
}

export interface SocialObservation {
  /** Provider-declared source, e.g. "x" — never assumed to be the only possible social source. */
  source: string;
  /** ISO timestamp of the underlying post, not of when HOODFLOW fetched it. */
  observedAt: string;
  authorId?: string;
  authorHandle?: string;
  /** Never inferred from a verification badge alone — see docs/DATA_SOURCES.md. */
  officialClassification: "OFFICIAL" | "UNOFFICIAL" | "UNKNOWN";
  /**
   * Untrusted external text. Rendered read-only in the frontend (never
   * dangerouslySetInnerHTML'd, never templated into a prompt or command) —
   * see docs/SECURITY.md §Prompt Injection Resistance.
   */
  text?: string;
  url?: string;
  /** Sum of likes/reposts/replies when the provider supplies them — undefined, not 0, when unreported. */
  engagementCount?: number;
  entityMatch: EntityMatch;
  sourceQuality: SourceQuality;
}

export interface SocialSummary {
  dataState: DataState;
  observationWindowStart?: string;
  observationWindowEnd?: string;
  postCount?: number;
  uniqueAuthorCount?: number;
  officialPostCount?: number;
  totalEngagement?: number;
  /** Posts per hour over the observation window. Undefined (not 0) when postCount/window can't be established. */
  mentionVelocity?: number;
  /** mentionVelocity minus the previous scan's mentionVelocity, only when a previous scan's summary exists. */
  mentionVelocityChange?: number;
  observations: SocialObservation[];
  limitations: string[];
}

export interface NewsObservation {
  /** Publisher/domain, e.g. "reuters.com". */
  source: string;
  title: string;
  publishedAt: string;
  url?: string;
  entityMatch: EntityMatch;
  sourceQuality: SourceQuality;
  /**
   * Deterministic, keyword/structure-based classification only — never an
   * LLM sentiment label presented as fact (§4 of the governing spec; see
   * docs/DATA_SOURCES.md).
   */
  category: "ANNOUNCEMENT" | "MARKET_COVERAGE" | "REGULATORY" | "GENERAL" | "UNKNOWN";
}

/** A single real-world story, after grouping syndicated copies together — see docs/DATA_SOURCES.md §Source Quality. */
export interface NewsStoryGroup {
  /** The earliest-published member's title — a representative headline, not a generated summary. */
  representativeTitle: string;
  firstPublishedAt: string;
  memberCount: number;
  /** Distinct publisher domains carrying this story. */
  sources: string[];
  members: NewsObservation[];
}

export interface NewsSummary {
  dataState: DataState;
  observationWindowStart?: string;
  observationWindowEnd?: string;
  /** Raw article count, including syndicated duplicates. */
  articleCount?: number;
  /** Distinct stories after de-duplication — "10 articles" vs "1 story syndicated across 10 outlets" (see docs/DATA_SOURCES.md). */
  storyCount?: number;
  storyGroups: NewsStoryGroup[];
  /** Distinct stories per hour over the observation window. */
  coverageVelocity?: number;
  limitations: string[];
}

/**
 * Attention/Hype components feeding `HoodflowReport.hype`. The overall
 * classification reuses the existing `HypeState` enum (types/intelligence.ts)
 * rather than the governing spec's suggested parallel `AttentionState` enum —
 * see docs/ROADMAP.md's history and docs/HYPE_ATTENTION.md for the exact
 * value-by-value mapping. Every numeric field is undefined (never 0) when its
 * inputs are unavailable, and the formula combining them is fully exposed
 * here rather than hidden inside a single opaque score — see
 * attention/attention-engine.ts.
 */
export interface AttentionComponents {
  mentionVelocity?: number;
  mentionAcceleration?: number;
  uniqueAuthorGrowth?: number;
  engagementVelocity?: number;
  newsCoverageVelocity?: number;
  /**
   * 0-1: how much of the (at most two) available attention channels
   * (social, news) actually moved in the same direction over the window.
   * Undefined when fewer than two channels have usable data — never forced
   * to 0 or 1 from a single channel.
   */
  socialNewsConvergence?: number;
}
