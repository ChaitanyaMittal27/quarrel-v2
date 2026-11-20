import type { FastifyInstance, FastifyServerOptions } from "fastify";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { buildApp, type AppDeps } from "../api/app";
import { createDb } from "../common/db";
import { createRedis } from "../common/redis";

/** The dev Redis container (docker run -d --name quarrel-redis -p 6380:6379 redis:7). */
export const DATABASE_URL = "postgres://quarrel:quarrel@localhost:5433/quarrel";
export const testDb = () => createDb(DATABASE_URL);

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

/** Test-only secrets (never used outside tests). */
export const TEST_SECRET = "test-secret-0123456789abcdefghijklmnop";
export const TEST_PREVIOUS_SECRET = "previous-secret-0123456789abcdefghijk";

export const testSession = (overrides: Partial<AppDeps["session"]> = {}): AppDeps["session"] => ({
  secret: TEST_SECRET,
  cookieSecure: false,
  ...overrides,
});

/** Unrelated HTTP tests need no database connection; results tests inject a real pool. */
export const workingDb = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool;

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
    db?: Pool;
    speech?: AppDeps["speech"];
    session?: Partial<AppDeps["session"]>;
    rooms?: AppDeps["rooms"];
    setup?: (app: FastifyInstance) => void;
    fastify?: FastifyServerOptions;
  } = {},
): Promise<TestApp> {
  const redis = await connectedRedis();
  const ratePrefix = `test:limits:${crypto.randomUUID()}`;
  const app = buildApp(
    { redis, limits: { create: 1000000, join: 1000000, prefix: ratePrefix }, db: options.db ?? workingDb, session: testSession(options.session), rooms: options.rooms, speech: options.speech },
    { logger: false, ...options.fastify },
  );
  options.setup?.(app);
  await app.ready();
  return {
    app,
    redis,
    close: async () => {
      await app.close();
      const counters = await redis.keys(`${ratePrefix}:*`);
      if (counters.length) await redis.del(...counters);
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
