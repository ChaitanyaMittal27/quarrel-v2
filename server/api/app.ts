import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Redis } from "ioredis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HealthResponse } from "@quarrel/shared/contract";
import { redisIsUp } from "../common/redis";

export interface AppDeps {
  redis: Redis;
  supabase: SupabaseClient;
  /** How long each health check may take before it counts as "down". */
  healthTimeoutMs?: number;
}

/**
 * Builds the Fastify app without starting it. Everything it talks to is passed in, so tests
 * can hand it a working or an unreachable Redis.
 */
export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(options);
  const timeoutMs = deps.healthTimeoutMs ?? 1500;

  // 200 when everything is up, 503 when not (same body). Load balancers and Docker health
  // checks look at the status code, so a degraded API must not answer 200.
  app.get("/api/health", async (_request, reply) => {
    const [redis, supabase] = await Promise.all([
      check(() => redisIsUp(deps.redis), timeoutMs),
      check(async () => {
        const { error } = await deps.supabase.storage.listBuckets();
        return !error;
      }, timeoutMs),
    ]);
    const body = HealthResponse.parse({ ok: redis === "up" && supabase === "up", redis, supabase });
    return reply.code(body.ok ? 200 : 503).send(body);
  });

  return app;
}

/** Runs a probe; any error, false result or timeout counts as "down". Never throws. */
async function check(probe: () => Promise<boolean>, timeoutMs: number): Promise<"up" | "down"> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return (await Promise.race([probe(), timeout])) ? "up" : "down";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}
