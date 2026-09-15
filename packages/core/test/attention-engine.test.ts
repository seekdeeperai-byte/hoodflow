import { describe, expect, it } from "vitest";
import { computeAttention } from "../src/attention/attention-engine.js";
import { DataState } from "../src/types/data-state.js";
import type { NewsSummary, SocialSummary } from "../src/types/social-news.js";

function social(overrides: Partial<SocialSummary> = {}): SocialSummary {
  return { dataState: DataState.AVAILABLE, observations: [], limitations: [], ...overrides };
}
function news(overrides: Partial<NewsSummary> = {}): NewsSummary {
  return { dataState: DataState.AVAILABLE, storyGroups: [], limitations: [], ...overrides };
}

describe("computeAttention", () => {
  it("returns UNKNOWN with a null score — never a fabricated 0 — when neither channel is usable", () => {
    const hype = computeAttention(social({ dataState: DataState.PROVIDER_UNAVAILABLE }), news({ dataState: DataState.DATA_UNAVAILABLE }));
    expect(hype.state).toBe("UNKNOWN");
    expect(hype.score).toBeNull();
    expect(hype.quality).toBe("UNKNOWN");
    expect(hype.confirmation).toBe("UNKNOWN");
  });

  it("classifies QUIET when both channels are usable but show no real activity", () => {
    const hype = computeAttention(social({ postCount: 0 }), news({ storyCount: 0 }));
    expect(hype.state).toBe("QUIET");
    expect(hype.score).toBe(0);
  });

  it("classifies HIGH_ATTENTION at a high absolute level without strong acceleration", () => {
    const hype = computeAttention(social({ postCount: 250, mentionVelocity: 5 }), news({ storyCount: 2 }));
    expect(hype.state).toBe("HIGH_ATTENTION");
  });

  it("classifies ACCELERATING on a >=50% mention-velocity jump at a non-extreme absolute level", () => {
    const hype = computeAttention(social({ postCount: 20, mentionVelocity: 3, mentionVelocityChange: 2 }), news({ storyCount: 0 })); // previous velocity 1 -> +200%
    expect(hype.state).toBe("ACCELERATING");
  });

  it("classifies COOLING on a >=50% mention-velocity drop", () => {
    const hype = computeAttention(social({ postCount: 5, mentionVelocity: 1, mentionVelocityChange: -3 }), news({ storyCount: 0 })); // previous 4 -> -75%
    expect(hype.state).toBe("COOLING");
  });

  it("caps quality at MEDIUM even with two usable channels — never HIGH from a single scan", () => {
    const hype = computeAttention(social({ postCount: 500 }), news({ storyCount: 20 }));
    expect(hype.quality).toBe("MEDIUM");
  });

  it("reports confirmation UNKNOWN (not fabricated LOW/MEDIUM) when only one channel is usable", () => {
    const hype = computeAttention(social({ postCount: 10 }), news({ dataState: DataState.DATA_UNAVAILABLE }));
    expect(hype.confirmation).toBe("UNKNOWN");
  });

  it("exposes every component it used, with unavailable inputs left undefined rather than 0", () => {
    const hype = computeAttention(social({ postCount: 10, mentionVelocity: 2 }), news({ dataState: DataState.DATA_UNAVAILABLE }));
    expect(hype.components?.mentionVelocity).toBe(2);
    expect(hype.components?.newsCoverageVelocity).toBeUndefined();
  });

  it("provides plain-language reasoning for its classification, never a bare enum with no explanation", () => {
    const hype = computeAttention(social({ postCount: 0 }), news({ storyCount: 0 }));
    expect(hype.reasoning && hype.reasoning.length).toBeGreaterThan(0);
  });
});
