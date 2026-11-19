import { z } from "zod";

const SessionSecret = z.string().min(32, "must be at least 32 characters");

const AiConfigSchema = z.object({
  JUDGE_AI_MODE: z.enum(["demo", "auto"]).default("demo"),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z.string().trim().default("gemini-3.6-flash"),
  GEMINI_FALLBACK_MODEL: z.string().trim().optional(),
  JUDGE_AI_TIMEOUT_MS: z.string().optional().transform((value) => {
    const milliseconds = Number(value ?? 8000);
    return Number.isFinite(milliseconds) ? Math.min(12000, Math.max(1000, Math.floor(milliseconds))) : 8000;
  }),
});
export type AiConfig = z.infer<typeof AiConfigSchema>;

/** Also used by isolated AI unit tests; values never appear in configuration errors. */
export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const result = AiConfigSchema.safeParse(Object.fromEntries(Object.entries(env).filter(([, value]) => value?.trim())));
  if (!result.success) throw new ConfigError(`Invalid AI configuration: ${result.error.issues.map((issue) => issue.path[0]).join(", ")}`);
  return result.data;
}

const ConfigSchema = AiConfigSchema.extend({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DEADLINE_POLL_MS: z.coerce.number().int().min(1).max(60000).default(250),
  REDIS_URL: z.url().default("redis://localhost:6380"),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Signs the access JWT. SESSION_SECRET_PREVIOUS lets tokens signed with the old secret keep
  // working for one rotation (they expire within 15 minutes anyway).
  SESSION_SECRET: SessionSecret,
  SESSION_SECRET_PREVIOUS: SessionSecret.optional(),
  // Adds the Secure flag to cookies (HTTPS only). Off for local http://localhost.
  COOKIE_SECURE: z.stringbool().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {}

/**
 * Reads and checks environment variables. Throws ConfigError naming each bad variable.
 * The message never includes a variable's value, so secrets can't leak into logs.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat empty strings as "not set" so defaults apply and required vars report "missing".
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = ConfigSchema.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? "(unknown)");
    if (cleaned[name] === undefined) return `  - ${name} is missing`;
    // Only our own custom messages are shown; they describe the rule, never the value.
    const detail = issue.code === "too_small" ? ` (${issue.message})` : "";
    return `  - ${name} has an invalid value${detail}`;
  });
  throw new ConfigError(`Invalid environment configuration:\n${problems.join("\n")}`);
}

/** For entry points: load config or print the problem and exit. */
export function loadConfigOrExit(): Config {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
