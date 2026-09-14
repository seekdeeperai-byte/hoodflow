/**
 * Every external provider call resolves to one of these states. Nothing
 * downstream of a provider is allowed to treat a missing/error state as
 * zero, false, or "safe" — see docs/ARCHITECTURE.md §5.
 */
export const DataState = {
  AVAILABLE: "AVAILABLE",
  PARTIAL: "PARTIAL",
  DATA_UNAVAILABLE: "DATA_UNAVAILABLE",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  INVALID_INPUT: "INVALID_INPUT",
  RATE_LIMITED: "RATE_LIMITED",
  ERROR: "ERROR",
} as const;

export type DataState = (typeof DataState)[keyof typeof DataState];

/** States that mean "there is usable data attached." */
export const USABLE_STATES: ReadonlySet<DataState> = new Set([
  DataState.AVAILABLE,
  DataState.PARTIAL,
]);

export function isUsable(state: DataState): boolean {
  return USABLE_STATES.has(state);
}

export interface ProviderResult<T> {
  state: DataState;
  data?: T;
  /** Human-readable, non-sensitive explanation. Never a stack trace or secret. */
  error?: string;
  provider: string;
  /**
   * When HOODFLOW made this call (FETCH_TIME). For every provider in this
   * build, the underlying fact was true at essentially this same instant
   * (these are live pull APIs, nothing is served from a cache yet) — see
   * `packages/core/src/freshness.ts` for where FETCH_TIME and
   * OBSERVATION_TIME are allowed to diverge once caching/history exists.
   */
  fetchedAt: string; // ISO timestamp
  /** Milliseconds the provider call took, when it completed. */
  latencyMs?: number;
  /** Raw HTTP status code, when a response was actually received (absent on network-level failures/timeouts). */
  httpStatus?: number;
}

export function available<T>(provider: string, data: T, latencyMs?: number, httpStatus?: number): ProviderResult<T> {
  return { state: DataState.AVAILABLE, data, provider, fetchedAt: new Date().toISOString(), latencyMs, httpStatus };
}

export function partial<T>(
  provider: string,
  data: T,
  error: string,
  latencyMs?: number,
  httpStatus?: number,
): ProviderResult<T> {
  return { state: DataState.PARTIAL, data, error, provider, fetchedAt: new Date().toISOString(), latencyMs, httpStatus };
}

export function unavailable<T>(
  provider: string,
  state: Exclude<DataState, "AVAILABLE" | "PARTIAL">,
  error: string,
  httpStatus?: number,
): ProviderResult<T> {
  return { state, error, provider, fetchedAt: new Date().toISOString(), httpStatus };
}
