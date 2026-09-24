import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { createApp } from "./create-app.js";

/**
 * Serverless adapter for the *same* Fastify app that `server.ts` listens with.
 *
 * Why this exists as a module in `src/` rather than as the Vercel entry point
 * itself: everything under `src/` is type-checked and compiled by
 * `apps/api/tsconfig.json`. `api/index.ts` (the file Vercel actually treats as
 * a function) is a one-line re-export of the build output of this file, so the
 * only code outside the type-checked tree is that single line. The alternative
 * — writing the adapter directly in `api/index.ts` — would put real production
 * logic in a file that `pnpm typecheck` never sees.
 *
 * The app instance is memoized at module scope. A serverless platform reuses a
 * warm instance across invocations, so this pays the Fastify/route/plugin
 * construction cost once per instance rather than once per request. It is NOT
 * a correctness shortcut: `buildApp` creates no per-request state, and the
 * provider clients and HistoryStore are already designed to be long-lived (the
 * long-running `server.ts` process holds exactly one of each for its lifetime).
 */
let appPromise: Promise<FastifyInstance> | undefined;

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = createApp()
      .then(async ({ app }) => {
        // `app.server.emit("request", ...)` bypasses `listen()`, so nothing else
        // triggers Fastify's plugin-boot phase. Without this await the first
        // request can reach the router before the rate-limit plugin is
        // registered.
        await app.ready();
        return app;
      })
      .catch((err: unknown) => {
        // A failed boot must not be cached as a permanently-rejected promise:
        // the usual cause is a transient dependency problem at cold start, and
        // the next invocation on this instance should be able to try again
        // rather than serve 500s forever. Same reasoning as
        // PostgresHistoryStore.ensureSchema().
        appPromise = undefined;
        throw err;
      });
  }
  return appPromise;
}

/**
 * Node-runtime function handler. Fastify exposes the underlying
 * `http.Server`, and emitting `"request"` on it runs the full Fastify
 * pipeline — hooks, rate limiting, routing, the 404 and error handlers —
 * against the platform's `req`/`res`. This is Fastify's own documented
 * serverless pattern and deliberately avoids re-implementing any part of
 * the request lifecycle here, so the deployed behaviour cannot drift from
 * what `server.ts` and the test suite exercise.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit("request", req, res);
}
