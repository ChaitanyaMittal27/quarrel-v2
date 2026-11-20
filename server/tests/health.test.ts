import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { buildApp } from "../api/app";
import { createRedis } from "../common/redis";
import { createDb } from "../common/db";
import { REDIS_URL, testSession, workingDb } from "./helpers";

// Needs the local Redis container on localhost:6380 (see helpers.ts).
// Nothing listens on this port, so connections are refused.
const UNREACHABLE_REDIS_URL = "redis://127.0.0.1:6390";
// A real client pointed at a dead address: its connection probe fails quickly.
const deadDb = createDb("postgres://quarrel:quarrel@127.0.0.1:1/quarrel");

let app: FastifyInstance | undefined;
let redis: Redis | undefined;
import { afterAll } from "vitest";
afterAll(() => deadDb.end());

afterEach(async () => {
  await app?.close();
  redis?.disconnect();
  app = undefined;
  redis = undefined;
});

async function getHealth(redisUrl: string, db: Pool) {
  redis = createRedis(redisUrl);
  app = buildApp({ redis, db, session: testSession(), healthTimeoutMs: 1000 });
  // inject() sends a fake request straight into Fastify: no port, no network.
  const response = await app.inject({ method: "GET", url: "/api/health" });
  return { status: response.statusCode, body: response.json() };
}

describe("GET /api/health", () => {
  it("answers 200 with ok true when Redis and Postgres are up", async () => {
    const { status, body } = await getHealth(REDIS_URL, workingDb);
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, redis: "up", postgres: "up" });
  });

  it('answers 503 with postgres "down" when only Postgres is unreachable', async () => {
    const { status, body } = await getHealth(REDIS_URL, deadDb);
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, redis: "up", postgres: "down" });
  });

  it('answers 503 with redis "down", quickly, when Redis is unreachable', async () => {
    const started = Date.now();
    const { status, body } = await getHealth(UNREACHABLE_REDIS_URL, workingDb);
    const elapsed = Date.now() - started;

    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, redis: "down", postgres: "up" });
    expect(elapsed).toBeLessThan(3000);
  }, 10_000);
});
