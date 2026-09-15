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
