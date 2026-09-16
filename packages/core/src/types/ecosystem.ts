/**
 * Ecosystem Intelligence types (FINAL GAP CLOSURE phase §5). Answers "what
 * is connected to this token?" using ONLY the canonical relationship model
 * (types/relationship-graph.ts) — there is no separate `EcosystemRelationship`
 * type; `ecosystem/ecosystem-engine.ts` constructs `CanonicalRelationship`
 * records directly with `category: "ECOSYSTEM"`. See
 * docs/ECOSYSTEM_INTELLIGENCE.md.
 */

import type { DataState } from "./data-state.js";
import type { EntityRef } from "./entities.js";
import type { CanonicalRelationship } from "./relationship-graph.js";

export interface EcosystemIntelligence {
  dataState: DataState;
  subject: EntityRef;
  /** Every entity referenced by `relationships` below, deduplicated, subject included first. */
  entities: EntityRef[];
  /** Always `category: "ECOSYSTEM"` — see types/relationship-graph.ts. */
  relationships: CanonicalRelationship[];
  limitations: string[];
}
