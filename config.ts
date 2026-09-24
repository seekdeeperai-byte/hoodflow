import { z } from "zod";

/**
 * Env config, validated at startup and failed-closed: a malformed env var
 * crashes on boot rather than silently disabling a security control (e.g.
 * a garbage PORT value must not silently fall back to some default that
 * masks a misconfiguration).
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  GOPLUS_API_KEY: z.string().optional(),
  BLOCKSCOUT_API_KEY: z.string().optional(),
  /** X (Twitter) API v2 bearer token — required for the social provider; unset means social intelligence returns PROVIDER_UNAVAILABLE (see docs/DATA_SOURCES.md). No credential is required for the news provider (GDELT). */
  X_BEARER_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  /**
   * Durable history (§18, REAL WORLD DEPLOYMENT phase). Unset by default —
   * HOODFLOW then keeps using InMemoryHistoryStore exactly as before,
   * so this is purely additive and never a required var. When set,
   * server.ts constructs a PostgresHistoryStore instead: see
   * apps/api/src/history/postgres-history-store.ts and
   * apps/api/migrations/001_init.sql. Never logged — only its presence is
   * ever reported (e.g. via /readiness), never the value, since it carries
   * embedded database credentials.
   */
  DATABASE_URL: z.string().optional(),
  /**
   * Upper bound on this process's PostgreSQL connection pool. Default 10 is
   * right for a long-running single-process deploy.
   *
   * Set it to 1 on a serverless platform. There, "one process" is not one
   * process: the platform runs many concurrent instances, each with its own
   * pool, so a pool of 10 per instance multiplies into hundreds of backend
   * connections and exhausts the database's connection limit (Supabase's
   * direct-connection limit on the free tier is small, which is exactly why
   * its pooler endpoint exists). Ignored entirely when DATABASE_URL is unset.
   */
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),
  /**
   * Whether to trust `X-Forwarded-For` when determining the client IP.
   *
   * This is a real security decision, so it is explicit configuration with a
   * fail-closed default rather than an auto-detected vendor check.
   *
   * false (default): `request.ip` is the socket's peer address. Correct when
   * the API is reached directly. Behind a reverse proxy every request appears
   * to originate from the proxy, so the per-IP rate limiter degrades into one
   * shared bucket for all users — the first 30 requests per minute from anyone
   * would 429 everybody else.
   *
   * true: Fastify reads the client IP from `X-Forwarded-For`. Only safe when
   * something in front of the app *overwrites* that header, because a
   * client-supplied value would otherwise let an attacker forge a fresh
   * rate-limit bucket per request. Vercel documents that it overwrites
   * `X-Forwarded-For` and does not forward externally-supplied values
   * (https://vercel.com/docs/headers/request-headers), so this is set to true
   * for that deployment and must stay false anywhere the front layer does not
   * make the same guarantee.
   */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Never log the raw env object — only the validation issue paths/messages.
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}
