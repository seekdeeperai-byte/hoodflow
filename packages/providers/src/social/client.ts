import { DataState, type KnownToken, type ProviderResult, type SocialObservation, available, unavailable } from "@hoodflow/core";
import { type FetchLike, ProviderHttpError, ProviderTimeoutError, fetchJson } from "../http.js";
import { XSearchResponseSchema, type XUser } from "./schema.js";
import { normalizeXTweet } from "./normalize.js";

const PROVIDER = "x";
const BASE_URL = "https://api.twitter.com/2/tweets/search/recent";
const MAX_RESULTS = 50;

export interface SocialClientOptions {
  /** X API v2 requires a Bearer token for every endpoint, including recent search, as of its current terms — see docs/DATA_SOURCES.md. */
  bearerToken?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/**
 * X (Twitter) API v2 recent-search client — the canonical, most-documented
 * public social API for this kind of query, per the governing spec's
 * requirement to respect API terms/auth/rate limits rather than scrape.
 * Real HTTP client code, but gated behind an explicit credential check: if
 * `X_BEARER_TOKEN` isn't configured, this returns PROVIDER_UNAVAILABLE
 * immediately, with NO network call — see docs/DATA_SOURCES.md and §18 of
 * the governing spec ("never fake provider implementations... return
 * explicit PROVIDER_UNAVAILABLE" when credentials are unavailable).
 */
export class XSocialClient {
  constructor(private readonly opts: SocialClientOptions = {}) {}

  async searchRecentPosts(
    query: string,
    target: { contractAddress: string; officialName?: string; symbol?: string },
    knownTokens: KnownToken[] = [],
  ): Promise<ProviderResult<SocialObservation[]>> {
    if (!this.opts.bearerToken) {
      return unavailable(
        PROVIDER,
        DataState.PROVIDER_UNAVAILABLE,
        "X_BEARER_TOKEN is not configured — the X API v2 recent-search endpoint requires a paid bearer token under its current terms (see docs/DATA_SOURCES.md). No request was made.",
      );
    }
    if (!query || query.trim().length === 0) {
      return unavailable(PROVIDER, DataState.INVALID_INPUT, "No query text was available to search social posts for.");
    }

    const params = new URLSearchParams({
      query,
      max_results: String(MAX_RESULTS),
      "tweet.fields": "created_at,public_metrics,author_id",
      expansions: "author_id",
      "user.fields": "username,verified",
    });
    const url = `${BASE_URL}?${params.toString()}`;
    const start = Date.now();

    try {
      const { status, json } = await fetchJson(url, {
        headers: { authorization: `Bearer ${this.opts.bearerToken}`, accept: "application/json" },
        fetchImpl: this.opts.fetchImpl,
        timeoutMs: this.opts.timeoutMs,
      });
      const latencyMs = Date.now() - start;

      if (status === 401 || status === 403) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, `X API returned HTTP ${status} (auth/access rejected, not a data rejection).`, status);
      }
      if (status === 429) return unavailable(PROVIDER, DataState.RATE_LIMITED, "X API rate limit exceeded.", status);
      if (status >= 500) return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, `X API returned HTTP ${status}.`, status);
      if (status >= 400) return unavailable(PROVIDER, DataState.ERROR, `X API returned HTTP ${status}.`, status);

      const parsed = XSearchResponseSchema.safeParse(json);
      if (!parsed.success) {
        return unavailable(
          PROVIDER,
          DataState.ERROR,
          `X API response failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
          status,
        );
      }

      const usersById = new Map<string, XUser>((parsed.data.includes?.users ?? []).map((u) => [u.id, u]));
      const tweets = parsed.data.data ?? [];
      const observations = tweets
        .map((t) => normalizeXTweet(t, usersById, target, knownTokens))
        .filter((o): o is SocialObservation => o !== undefined);

      // An empty result is a real, informative zero ("no matching posts found this window"),
      // never conflated with a provider failure.
      return available(PROVIDER, observations, latencyMs, status);
    } catch (err) {
      if (err instanceof ProviderTimeoutError) return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err.message);
      if (err instanceof ProviderHttpError) return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err.message);
      return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err instanceof Error ? err.message : "Unknown X API error.");
    }
  }
}
