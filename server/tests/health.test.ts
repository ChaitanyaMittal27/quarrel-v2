import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApp } from "../api/app";
import { createRedis } from "../common/redis";
import { createSupabase } from "../common/supabase";

// Needs the local Redis container (sub-stage B6) on localhost:6379.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
// Nothing listens on this port, so connections are refused.
const UNREACHABLE_REDIS_URL = "redis://127.0.0.1:6390";
// A real client pointed at a dead address: its Storage check fails quickly.
const deadSupabase = createSupabase("http://127.0.0.1:1", "test-key");
// A stand-in whose Storage check always succeeds, so the "all up" case needs no real Supabase.
const workingSupabase = {
  storage: { listBuckets: async () => ({ data: [], error: null }) },
} as unknown as SupabaseClient;

let app: FastifyInstance | undefined;
let redis: Redis | undefined;

afterEach(async () => {
  await app?.close();
  redis?.disconnect();
  app = undefined;
  redis = undefined;
});

async function getHealth(redisUrl: string, supabase: SupabaseClient) {
  redis = createRedis(redisUrl);
  app = buildApp({ redis, supabase, healthTimeoutMs: 1000 });
  // inject() sends a fake request straight into Fastify: no port, no network.
  const response = await app.inject({ method: "GET", url: "/api/health" });
  return { status: response.statusCode, body: response.json() };
}

describe("GET /api/health", () => {
  it("answers 200 with ok true when Redis and Supabase are up", async () => {
    const { status, body } = await getHealth(REDIS_URL, workingSupabase);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, redis: "up", supabase: "up" });
  });

  it('answers 503 with supabase "down" when only Supabase is unreachable', async () => {
    const { status, body } = await getHealth(REDIS_URL, deadSupabase);
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, redis: "up", supabase: "down" });
  });

  it('answers 503 with redis "down", quickly, when Redis is unreachable', async () => {
    const started = Date.now();
    const { status, body } = await getHealth(UNREACHABLE_REDIS_URL, workingSupabase);
    const elapsed = Date.now() - started;

    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, redis: "down", supabase: "up" });
    expect(elapsed).toBeLessThan(3000);
  }, 10_000);
});
