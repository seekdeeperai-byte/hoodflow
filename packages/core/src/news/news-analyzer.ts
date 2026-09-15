import { DataState, isUsable } from "../types/data-state.js";
import { Confidence, Direction, type Signal, SignalType, Strength } from "../types/intelligence.js";
import { EntityMatchBasis, type NewsObservation, type NewsStoryGroup, type NewsSummary } from "../types/social-news.js";

const MIN_WINDOW_HOURS = 0.25;
/** Two titles sharing at least this fraction of their normalized word set are treated as one syndicated story. First-pass, documented, changeable — see docs/DATA_SOURCES.md. */
const SYNDICATION_SIMILARITY_THRESHOLD = 0.6;

function normalizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2); // drop very short/stopword-like tokens
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Groups syndicated copies of the same story together — "10 articles" vs
 * "1 story syndicated across 10 outlets" (governing spec §9). Pure,
 * deterministic, greedy: processes observations oldest-first so a group's
 * `representativeTitle`/`firstPublishedAt` is always its earliest member,
 * and compares each new observation's normalized title against every
 * existing group's representative (not every prior observation), which
 * keeps this O(n * groups) rather than O(n^2) in the common case where
 * distinct stories vastly outnumber syndicated copies of any one story.
 */
export function groupNewsStories(observations: NewsObservation[]): NewsStoryGroup[] {
  const sorted = [...observations].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const groups: NewsStoryGroup[] = [];
  const groupTokens: string[][] = [];

  for (const obs of sorted) {
    const tokens = normalizeTitle(obs.title);
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < groups.length; i++) {
      const score = jaccardSimilarity(tokens, groupTokens[i]!);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestScore >= SYNDICATION_SIMILARITY_THRESHOLD) {
      const group = groups[bestIdx]!;
      group.members.push(obs);
      group.memberCount = group.members.length;
      if (!group.sources.includes(obs.source)) group.sources.push(obs.source);
    } else {
      groups.push({
        representativeTitle: obs.title,
        firstPublishedAt: obs.publishedAt,
        memberCount: 1,
        sources: [obs.source],
        members: [obs],
      });
      groupTokens.push(tokens);
    }
  }

  return groups;
}

function windowHours(start: string | undefined, end: string | undefined): number | undefined {
  if (!start || !end) return undefined;
  const hrs = (Date.parse(end) - Date.parse(start)) / (1000 * 60 * 60);
  if (!Number.isFinite(hrs) || hrs < MIN_WINDOW_HOURS) return undefined;
  return hrs;
}

/**
 * Aggregates already-fetched, already-entity-matched news observations into
 * a `NewsSummary` (including syndication-grouped story count) plus a small
 * set of Signals. Pure, no I/O. Entity matching happens upstream
 * (packages/providers/src/news/normalize.ts), same rationale as
 * social/social-analyzer.ts.
 */
export function analyzeNews(
  observations: NewsObservation[] | undefined,
  dataState: DataState,
  options: { now?: string } = {},
): { summary: NewsSummary; signals: Signal[] } {
  const now = options.now ?? new Date().toISOString();

  if (!isUsable(dataState) || observations === undefined) {
    return {
      summary: {
        dataState,
        storyGroups: [],
        limitations: [`News data unavailable (${dataState}) — this means the provider could not be reached, not that no news exists.`],
      },
      signals: [],
    };
  }

  const matched = observations.filter((o) => o.entityMatch.basis !== EntityMatchBasis.NO_MATCH);
  const limitations: string[] = [];
  if (matched.length < observations.length) {
    limitations.push(
      `${observations.length - matched.length} fetched article(s) did not match this token by contract address, official name, or unambiguous symbol and were excluded.`,
    );
  }
  const ambiguous = matched.filter((o) => o.entityMatch.basis === EntityMatchBasis.SYMBOL_AMBIGUOUS);
  if (ambiguous.length > 0) {
    limitations.push(
      `${ambiguous.length} matched article(s) were matched only via an ambiguous shared symbol — included, but with lower confidence than a contract-address or official-name match.`,
    );
  }

  const storyGroups = groupNewsStories(matched);
  const timestamps = matched.map((o) => o.publishedAt).filter((t) => !Number.isNaN(Date.parse(t)));
  const observationWindowStart = timestamps.length > 0 ? timestamps.reduce((a, b) => (a < b ? a : b)) : undefined;
  const observationWindowEnd = timestamps.length > 0 ? timestamps.reduce((a, b) => (a > b ? a : b)) : undefined;
  const hrs = windowHours(observationWindowStart, observationWindowEnd);
  const coverageVelocity = hrs !== undefined && storyGroups.length > 0 ? storyGroups.length / hrs : undefined;

  const syndicatedGroups = storyGroups.filter((g) => g.memberCount > 1);
  if (syndicatedGroups.length > 0) {
    limitations.push(
      `${syndicatedGroups.length} story group(s) were carried by more than one outlet (${syndicatedGroups.reduce((s, g) => s + g.memberCount, 0)} articles total) — reported as distinct stories, not double-counted.`,
    );
  }
  if (matched.length === 0) {
    limitations.push("No matching news articles were found in this observation window — this is a real zero, not a missing measurement.");
  }

  const summary: NewsSummary = {
    dataState,
    observationWindowStart,
    observationWindowEnd,
    articleCount: matched.length,
    storyCount: storyGroups.length,
    storyGroups,
    coverageVelocity,
    limitations,
  };

  const signals: Signal[] = [];
  if (storyGroups.length > 0) {
    signals.push({
      signalType: SignalType.NEWS_COVERAGE_LEVEL,
      direction: Direction.NEUTRAL,
      strength: storyGroups.length >= 10 ? Strength.HIGH : storyGroups.length >= 3 ? Strength.MEDIUM : Strength.LOW,
      confidence: Confidence.MEDIUM,
      source: "news",
      evidence: `${storyGroups.length} distinct news stor${storyGroups.length === 1 ? "y" : "ies"} (${matched.length} article(s) across ${new Set(matched.map((m) => m.source)).size} publisher(s)) observed${
        observationWindowStart && observationWindowEnd ? ` between ${observationWindowStart} and ${observationWindowEnd}` : ""
      }.`,
      timestamp: now,
    });
  }

  return { summary, signals };
}
