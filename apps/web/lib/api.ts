import type { HoodflowReport } from "@hoodflow/core";

/**
 * Thin client for the existing, unmodified API route
 * (`GET /v1/report/:chainId/:address` in apps/api/src/routes/report.ts).
 * This file does not compute, transform, or reinterpret any intelligence —
 * it only fetches the report exactly as the backend built it and classifies
 * the HTTP-level outcome. Every field the UI renders comes straight from
 * the parsed `HoodflowReport`; see lib/present-history.ts for the only
 * transformation this frontend performs (unit/phrasing presentation of
 * already-computed backend values, never new computation).
 *
 * Requests go to a same-origin relative path (`/api/v1/...`); next.config.mjs
 * rewrites that, server-side, to the real API. The browser never knows the
 * API's real address, and the backend needed zero changes (no CORS) to
 * support this.
 */

export type ReportRequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; report: HoodflowReport }
  | { status: "invalid_input"; message: string }
  | { status: "not_found"; message: string }
  | { status: "rate_limited"; message: string }
  | { status: "api_error"; message: string };

interface ApiErrorBody {
  error?: string;
  message?: string;
}

export async function fetchReport(chainId: string, address: string): Promise<ReportRequestState> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/report/${encodeURIComponent(chainId)}/${encodeURIComponent(address)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return {
      status: "api_error",
      message: "Could not reach the HoodFlow intelligence engine. The API may be offline or unreachable from this environment.",
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "api_error", message: "The intelligence engine returned a response that could not be parsed." };
  }

  if (response.ok) {
    // The route only ever returns 200 with a well-formed HoodflowReport body — trust the
    // existing backend contract rather than re-validating it a second time in the frontend
    // (packages/core's own tests already prove this shape; duplicating that check here would
    // be exactly the "recomputing intelligence in the frontend" this app is built to avoid).
    return { status: "success", report: body as HoodflowReport };
  }

  const err = body as ApiErrorBody;
  const message = err.message ?? "The intelligence engine returned an unexpected error.";

  if (response.status === 400) return { status: "invalid_input", message };
  if (response.status === 404) return { status: "not_found", message };
  if (response.status === 429) return { status: "rate_limited", message };
  return { status: "api_error", message };
}
