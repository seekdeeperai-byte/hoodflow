import type { FetchLike } from "../src/http.js";

export function mockFetchOnce(status: number, body: unknown): FetchLike {
  return (async () =>
    ({
      status,
      json: async () => body,
    }) as unknown as Response) as FetchLike;
}

export function mockFetchSequence(responses: Array<{ status: number; body: unknown }>): FetchLike {
  let i = 0;
  return (async () => {
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return { status: r.status, json: async () => r.body } as unknown as Response;
  }) as FetchLike;
}

export function mockFetchAbort(): FetchLike {
  return (async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }) as FetchLike;
}

export function mockFetchMalformedJson(status = 200): FetchLike {
  return (async () =>
    ({
      status,
      json: async () => {
        throw new Error("not json");
      },
    }) as unknown as Response) as FetchLike;
}
