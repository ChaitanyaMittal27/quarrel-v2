import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApp } from "../api/app";
import { createRedis } from "../common/redis";
import { createSupabase } from "../common/supabase";
import { REDIS_URL, testSession, workingSupabase } from "./helpers";

// Needs the local Redis container on localhost:6380 (see helpers.ts).
// Nothing listens on this port, so connections are refused.
const UNREACHABLE_REDIS_URL = "redis://127.0.0.1:6390";
// A real client pointed at a dead address: its Storage check fails quickly.
const deadSupabase = createSupabase("http://127.0.0.1:1", "test-key");

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
  app = buildApp({ redis, supabase, session: testSession(), healthTimeoutMs: 1000 });
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
