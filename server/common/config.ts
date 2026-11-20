import { z } from "zod";

const DatabaseUrl = z.url().refine((value) => /^postgres(?:ql)?:\/\//.test(value), "Use a Postgres URL").default("postgres://quarrel:quarrel@localhost:5433/quarrel");
export function loadDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const result = DatabaseUrl.safeParse(env.DATABASE_URL || undefined);
  if (!result.success) throw new ConfigError("Invalid DATABASE_URL");
  return result.data;
}

const SessionSecret = z.string().min(32, "must be at least 32 characters");
const QuotaTimezone = z.string().refine((timeZone) => { try { new Intl.DateTimeFormat('en', { timeZone }); return true; } catch { return false; } }, 'Invalid quota timezone').default('America/Los_Angeles');

const AiConfigSchema = z.object({
  JUDGE_AI_MODE: z.enum(["demo", "auto"]).default("demo"),
  // Only the isolated demo E2E stack may opt into reading injected quota markers.
  AI_QUOTA_E2E: z.stringbool().default(false),
  AI_QUOTA_RESET_TZ: QuotaTimezone,
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

const TtsConfigSchema = z.object({
  JUDGE_AI_MODE: z.enum(["demo", "auto"]).default("demo"),
  AI_QUOTA_E2E: z.stringbool().default(false),
  AI_QUOTA_RESET_TZ: QuotaTimezone,
  GEMINI_TTS_API_KEY: z.string().trim().optional(),
  GEMINI_TTS_MODEL: z.string().regex(/^gemini-[a-z0-9.-]+tts[a-z0-9.-]*$/).default("gemini-3.8-flash-tts"),
  TTS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(20000),
  TTS_CACHE_MAX_BYTES: z.coerce.number().int().min(1).max(8388608).default(2097152),
});
export type TtsConfig = z.infer<typeof TtsConfigSchema>;
export function loadTtsConfig(env: NodeJS.ProcessEnv = process.env): TtsConfig {
  const result = TtsConfigSchema.safeParse(Object.fromEntries(Object.entries(env).filter(([,value]) => value?.trim())));
  if (!result.success) throw new ConfigError(`Invalid TTS configuration: ${result.error.issues.map((issue) => issue.path[0]).join(", ")}`);
  return result.data;
}
const ConfigSchema = AiConfigSchema.extend(TtsConfigSchema.shape).extend({
  TRUST_PROXY: z.stringbool().default(false),
  ROOM_CREATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(10),
  ROOM_JOIN_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(30),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DEADLINE_POLL_MS: z.coerce.number().int().min(1).max(60000).default(250),
  SUMMARY_WORK_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(30000),
  SUMMARY_AI_TIMEOUT_MS: z.coerce.number().int().min(1).max(12000).default(5000),
  LAWYER_WORK_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(30000),
  LAWYER_AI_TIMEOUT_MS: z.coerce.number().int().min(1).max(12000).default(5000),
  REDIS_URL: z.url().default("redis://localhost:6380"),
  DATABASE_URL: DatabaseUrl,
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
