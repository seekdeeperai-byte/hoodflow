/**
 * Shared HTTP helper for provider clients.
 *
 * SSRF note: every call site in this package builds its request URL from a
 * hardcoded, provider-owned base URL plus a *validated* address/chain-id
 * path segment (validated before it ever reaches here — see
 * `validateEvmAddress`/`assertKnownChain` in each client). Nothing in this
 * package ever fetches a URL supplied directly by a caller, which is what
 * closes off the SSRF surface for "enter a token address" style input.
 */

export type FetchLike = typeof fetch;

export interface HttpClientOptions {
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export class ProviderTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${safeUrlForLog(url)} timed out after ${timeoutMs}ms`);
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`Request to ${safeUrlForLog(url)} failed with HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}

/** Strips query strings before logging/erroring so API keys never land in logs. */
export function safeUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "[unparseable-url]";
  }
}

export async function fetchJson(
  url: string,
  init: RequestInit & HttpClientOptions = {},
): Promise<{ status: number; json: unknown }> {
  const { timeoutMs = 8000, fetchImpl = fetch, ...requestInit } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...requestInit, signal: controller.signal });
    const status = res.status;
    let json: unknown = undefined;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    return { status, json };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
