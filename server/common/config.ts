import { z } from "zod";

const ConfigSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // v1 checks only for "demo"; anything else means "use real AI when a key is set".
  JUDGE_AI_MODE: z.enum(["demo", "auto"]).default("demo"),
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
    const reason = cleaned[name] === undefined ? "is missing" : "has an invalid value";
    return `  - ${name} ${reason}`;
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
