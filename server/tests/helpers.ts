import type { FastifyInstance, FastifyServerOptions } from "fastify";
import type { Redis } from "ioredis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApp, type AppDeps } from "../api/app";
import { createRedis } from "../common/redis";

/** The dev Redis container (docker run -d --name quarrel-redis -p 6380:6379 redis:7). */
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

/** Test-only secrets (never used outside tests). */
export const TEST_SECRET = "test-secret-0123456789abcdefghijklmnop";
export const TEST_PREVIOUS_SECRET = "previous-secret-0123456789abcdefghijk";

export const testSession = (overrides: Partial<AppDeps["session"]> = {}): AppDeps["session"] => ({
  secret: TEST_SECRET,
  cookieSecure: false,
  ...overrides,
});

/** A stand-in Supabase whose Storage check always succeeds. */
export const workingSupabase = {
  storage: { listBuckets: async () => ({ data: [], error: null }) },
} as unknown as SupabaseClient;

/**
 * A Redis client that is connected before it is returned. The API client rejects commands
 * while it is still connecting (fail-fast), so tests must wait for "ready".
 */
export async function connectedRedis(url = REDIS_URL): Promise<Redis> {
  const redis = createRedis(url);
  if (redis.status !== "ready") {
    await new Promise<void>((resolve, reject) => {
      redis.once("ready", () => resolve());
      redis.once("error", reject);
    });
  }
  return redis;
}

export interface TestApp {
  app: FastifyInstance;
  redis: Redis;
  close: () => Promise<void>;
}

/**
 * Builds the app against the real Redis. `setup` can add test-only routes before the app
 * starts (Fastify doesn't allow adding routes after the first request).
 */
export async function testApp(
  options: {
    session?: Partial<AppDeps["session"]>;
    setup?: (app: FastifyInstance) => void;
    fastify?: FastifyServerOptions;
  } = {},
): Promise<TestApp> {
  const redis = await connectedRedis();
  const app = buildApp(
    { redis, supabase: workingSupabase, session: testSession(options.session) },
    { logger: false, ...options.fastify },
  );
  options.setup?.(app);
  await app.ready();
  return {
    app,
    redis,
    close: async () => {
      await app.close();
      redis.disconnect();
    },
  };
}

export interface SetCookie {
  name: string;
  value: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** The Set-Cookie headers of an inject() response, by cookie name. */
export function cookiesOf(response: { cookies: SetCookie[] }): Record<string, SetCookie> {
  return Object.fromEntries(response.cookies.map((cookie) => [cookie.name, cookie]));
}

/** True if a Set-Cookie deletes the cookie (empty value, already expired). */
export function isCleared(cookie: SetCookie | undefined): boolean {
  return cookie !== undefined && cookie.value === "" && cookie.maxAge === 0;
}
