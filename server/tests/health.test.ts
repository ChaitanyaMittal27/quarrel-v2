import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { buildApp } from "../api/app";
import { createRedis } from "../common/redis";
import { createSupabase } from "../common/supabase";

// Needs the local Redis container (sub-stage B6) on localhost:6379.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
// Nothing listens on this port, so connections are refused.
const UNREACHABLE_REDIS_URL = "redis://127.0.0.1:6390";
// Supabase isn't under test here; point it at a dead address so it reports "down" quickly.
const supabase = createSupabase("http://127.0.0.1:1", "test-key");

let app: FastifyInstance | undefined;
let redis: Redis | undefined;

afterEach(async () => {
  await app?.close();
  redis?.disconnect();
  app = undefined;
  redis = undefined;
});

async function getHealth(redisUrl: string) {
  redis = createRedis(redisUrl);
  app = buildApp({ redis, supabase, healthTimeoutMs: 1000 });
  // inject() sends a fake request straight into Fastify: no port, no network.
  const response = await app.inject({ method: "GET", url: "/api/health" });
  return { status: response.statusCode, body: response.json() };
}

describe("GET /api/health", () => {
  it('reports redis "up" when Redis is reachable', async () => {
    const { status, body } = await getHealth(REDIS_URL);
    expect(status).toBe(200);
    expect(body.redis).toBe("up");
  });

  it('reports redis "down" and ok false, quickly, when Redis is unreachable', async () => {
    const started = Date.now();
    const { status, body } = await getHealth(UNREACHABLE_REDIS_URL);
    const elapsed = Date.now() - started;

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: false, redis: "down" });
    expect(elapsed).toBeLessThan(3000);
  }, 10_000);
});
