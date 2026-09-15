import { IdentityStatus, type IdentityResolution } from "../types/identity.js";
import { Confidence, Direction, type Signal, SignalType, Strength } from "../types/intelligence.js";

/**
 * Turns an IdentityResolution into Signals, same shape/conventions as every
 * other analyzer (contract-analyzer.ts, holders-analyzer.ts). Never emits a
 * verdict word — only observations plus the evidence behind them. See
 * docs/IDENTITY_RESOLUTION.md.
 *
 * At most one "primary status" signal is emitted per resolution (chosen by
 * specificity, not by piling on every technically-true signal — product
 * spec Phase 5 §14: "Do not emit a signal merely to increase feature
 * coverage"). IDENTITY_COLLISION is the one exception: it is independent of
 * status and fires whenever `conflicts.length > 0`, because "this address's
 * own identity is fine" and "a lookalike exists elsewhere on this chain"
 * are genuinely two separate, both-useful facts.
 */
export function analyzeIdentity(resolution: IdentityResolution, now: string = new Date().toISOString()): Signal[] {
  const signals: Signal[] = [];
  const push = (signalType: SignalType, direction: Direction, strength: Strength, confidence: Confidence, evidence: string) => {
    signals.push({ signalType, direction, strength, confidence, source: "identity", evidence, timestamp: now });
  };

  switch (resolution.status) {
    case IdentityStatus.CONFIRMED: {
      const m = resolution.match!;
      if (m.source === "official_docs") {
        push(
          SignalType.OFFICIAL_IDENTITY_MATCH,
          Direction.POSITIVE,
          Strength.HIGH,
          Confidence.HIGH,
          `Contract address matches a first-party/official known identity (${m.symbol}${m.name ? `, "${m.name}"` : ""}) — registry source: official_docs.`,
        );
      } else if (m.source === "live_confirmed_third_party") {
        push(
          SignalType.IDENTITY_CONFIRMED,
          Direction.POSITIVE,
          Strength.MEDIUM,
          Confidence.MEDIUM,
          `Contract address matches a known registry entry (${m.symbol}) that was independently confirmed live, though not sourced from first-party documentation.`,
        );
      } else {
        // unconfirmed_third_party or test_fixture — a registry match exists, but its
        // own provenance is weak. Deliberately NOT "confirmed" or "official" language.
        push(
          SignalType.NON_OFFICIAL_IDENTITY_CONTEXT,
          Direction.NEUTRAL,
          Strength.LOW,
          Confidence.LOW,
          `Contract address matches a known registry entry (${m.symbol}), but that entry's own provenance (${m.source}) has not been independently confirmed.`,
        );
      }
      break;
    }
    case IdentityStatus.CONFLICTING: {
      push(
        SignalType.IDENTITY_MISMATCH,
        Direction.NEGATIVE,
        Strength.MEDIUM,
        Confidence.LOW,
        resolution.match
          ? `Provider-reported name/symbol for this contract disagrees with HOODFLOW's own registry entry for the same address (registry says "${resolution.match.symbol}").`
          : "Contextual name/symbol information observed for this contract matches a DIFFERENT known contract address on this chain, not this one. This is not evidence of malicious intent — but symbol alone should not be used to identify this asset.",
      );
      break;
    }
    case IdentityStatus.AMBIGUOUS: {
      push(
        SignalType.IDENTITY_AMBIGUITY,
        Direction.NEUTRAL,
        Strength.MEDIUM,
        Confidence.LOW,
        "Multiple distinct known contract addresses on this chain share overlapping name/symbol context with this token. Available evidence is insufficient to confirm which, if any, this contract corresponds to.",
      );
      break;
    }
    case IdentityStatus.UNVERIFIED: {
      push(
        SignalType.IDENTITY_UNVERIFIED,
        Direction.NEUTRAL,
        Strength.LOW,
        Confidence.LOW,
        "This contract address does not match any entry in HOODFLOW's known-token registry. This does not indicate a problem — the registry is small and manually curated, and most legitimate tokens are not yet in it.",
      );
      break;
    }
    case IdentityStatus.UNAVAILABLE:
      // Nothing to report — the caller (build-report.ts) adds a limitation
      // string instead, consistent with how other domains handle an
      // unusable state.
      break;
  }

  if (resolution.conflicts.length > 0) {
    const list = resolution.conflicts.map((c) => `${c.conflictingSymbol ?? "?"} @ ${c.conflictingAddress}`).join(", ");
    push(
      SignalType.IDENTITY_COLLISION,
      Direction.NEGATIVE,
      resolution.conflicts.length > 1 ? Strength.HIGH : Strength.MEDIUM,
      Confidence.MEDIUM,
      `${resolution.conflicts.length} other known contract${resolution.conflicts.length > 1 ? "s" : ""} on this chain share this token's name/symbol context at ${resolution.conflicts.length > 1 ? "different addresses" : "a different address"}: ${list}. A shared symbol never confirms these are the same asset.`,
    );
  }

  return signals;
}
