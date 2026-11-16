import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../common/config";

const base = {
  SUPABASE_URL: "http://127.0.0.1:55321",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  SESSION_SECRET: "s".repeat(32),
};

function configError(env: Record<string, string>): string {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig: sessions", () => {
  it("accepts a valid configuration with defaults", () => {
    const config = loadConfig(base);
    expect(config.SESSION_SECRET).toBe(base.SESSION_SECRET);
    expect(config.SESSION_SECRET_PREVIOUS).toBeUndefined();
    expect(config.COOKIE_SECURE).toBe(false);
    expect(config.REDIS_URL).toBe("redis://localhost:6380");
  });

  it("names a missing SESSION_SECRET", () => {
    const { SESSION_SECRET: _, ...env } = base;
    expect(configError(env)).toContain("SESSION_SECRET is missing");
    expect(configError({ ...base, SESSION_SECRET: "" })).toContain("SESSION_SECRET is missing");
  });

  it("names a short SESSION_SECRET without printing it", () => {
    const message = configError({ ...base, SESSION_SECRET: "too-short-secret-value" });
    expect(message).toContain("SESSION_SECRET has an invalid value (must be at least 32 characters)");
    expect(message).not.toContain("too-short-secret-value");
  });

  it("applies the same rule to SESSION_SECRET_PREVIOUS", () => {
    expect(loadConfig({ ...base, SESSION_SECRET_PREVIOUS: "p".repeat(32) }).SESSION_SECRET_PREVIOUS).toBe(
      "p".repeat(32),
    );
    expect(configError({ ...base, SESSION_SECRET_PREVIOUS: "short" })).toContain(
      "SESSION_SECRET_PREVIOUS has an invalid value",
    );
  });

  it("reads COOKIE_SECURE as a boolean", () => {
    expect(loadConfig({ ...base, COOKIE_SECURE: "true" }).COOKIE_SECURE).toBe(true);
    expect(loadConfig({ ...base, COOKIE_SECURE: "false" }).COOKIE_SECURE).toBe(false);
    expect(configError({ ...base, COOKIE_SECURE: "maybe" })).toContain("COOKIE_SECURE has an invalid value");
  });
});
