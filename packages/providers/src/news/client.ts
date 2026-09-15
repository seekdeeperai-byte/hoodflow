import { DataState, type KnownToken, type NewsObservation, type ProviderResult, available, unavailable } from "@hoodflow/core";
import { type FetchLike, ProviderHttpError, ProviderTimeoutError, fetchJson } from "../http.js";
import { GdeltResponseSchema } from "./schema.js";
import { normalizeGdeltArticle } from "./normalize.js";

const PROVIDER = "gdelt-news";
const BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_RECORDS = 50;

export interface NewsClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/**
 * GDELT DOC 2.0 API client — a public, free, no-key-required news search API
 * (see docs/DATA_SOURCES.md). Chosen deliberately over a paid news API
 * (NewsAPI.org, licensed feeds, etc.) so this provider needs no
 * product-owner credential decision to exist at all, per the governing
 * spec's §4 ("design for pluggable additional sources" — a licensed feed
 * can be added later as a second client behind the same NewsObservation
 * shape without changing anything downstream).
 */
export class GdeltNewsClient {
  constructor(private readonly opts: NewsClientOptions = {}) {}

  async searchNews(
    query: string,
    target: { contractAddress: string; officialName?: string; symbol?: string },
    knownTokens: KnownToken[] = [],
  ): Promise<ProviderResult<NewsObservation[]>> {
    if (!query || query.trim().length === 0) {
      return unavailable(PROVIDER, DataState.INVALID_INPUT, "No query text was available to search news for.");
    }

    const url = `${BASE_URL}?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${MAX_RECORDS}&format=json&sort=datedesc`;
    const start = Date.now();

    try {
      const { status, json } = await fetchJson(url, {
        headers: { accept: "application/json" },
        fetchImpl: this.opts.fetchImpl,
        timeoutMs: this.opts.timeoutMs,
      });
      const latencyMs = Date.now() - start;

      if (status === 429) return unavailable(PROVIDER, DataState.RATE_LIMITED, "GDELT rate limit exceeded.", status);
      if (status === 403) {
        return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, "GDELT returned HTTP 403 (blocked, not a data rejection).", status);
      }
      if (status >= 500) return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, `GDELT returned HTTP ${status}.`, status);
      if (status >= 400) return unavailable(PROVIDER, DataState.ERROR, `GDELT returned HTTP ${status}.`, status);

      const parsed = GdeltResponseSchema.safeParse(json);
      if (!parsed.success) {
        return unavailable(
          PROVIDER,
          DataState.ERROR,
          `GDELT response failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
          status,
        );
      }

      const articles = parsed.data.articles ?? [];
      const observations = articles
        .map((a) => normalizeGdeltArticle(a, target, knownTokens))
        .filter((o): o is NewsObservation => o !== undefined);

      // An empty result is a real, informative zero ("no matching news found this window"),
      // never conflated with a provider failure — see docs/DATA_SOURCES.md.
      return available(PROVIDER, observations, latencyMs, status);
    } catch (err) {
      if (err instanceof ProviderTimeoutError) return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err.message);
      if (err instanceof ProviderHttpError) return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err.message);
      return unavailable(PROVIDER, DataState.PROVIDER_UNAVAILABLE, err instanceof Error ? err.message : "Unknown GDELT error.");
    }
  }
}
