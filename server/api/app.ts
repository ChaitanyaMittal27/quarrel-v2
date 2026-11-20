import { registerSpeechRoutes } from "./speech";
import { SpeechService } from "../speech/speech-service";
import { SpeechRepo } from "../speech/speech-repo";
import { loadAiConfig, loadTtsConfig, type AiConfig, type TtsConfig } from "../common/config";
import { QuotaStore } from '../ai/quota-store';
import { AiStatus } from '@quarrel/shared/contract';
import { RoomLimits, type RoomLimitOptions } from '../rooms/room-limits';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { ResultsService } from "../results/results-service";
import { registerResultRoutes } from "./results";
import { HealthResponse } from "@quarrel/shared/contract";
import { redisIsUp } from "../common/redis";
import { registerErrorHandling, sendParsed } from "./errors";
import { RefreshStore } from "./refresh-store";
import { sessionPlugin } from "./session";
import { RoomRepo } from "../rooms/room-repo";
import { RoomService, type RoomServiceOptions } from "../rooms/room-service";
import { registerRoomRoutes } from "./rooms";

export interface AppDeps {
  ai?: AiConfig;
  trustProxy?: boolean;
  limits?: RoomLimitOptions;
  redis: Redis;
  speech?: { config?: TtsConfig; generate?: typeof import("../worker/ai/speech-provider").generateSpeech; prefix?: string; wait?: (ms:number) => Promise<void>; waitMs?: number };
  rooms?: RoomServiceOptions;
  db: Pool;
  session: {
    secret: string;
    previousSecret?: string;
    cookieSecure: boolean;
    accessTtlSeconds?: number;
    /** Tests only: a shorter refresh grace window than REFRESH_GRACE_MS. */
    refreshGraceMs?: number;
  };
  /** How long each health check may take before it counts as "down". */
  healthTimeoutMs?: number;
}

/**
 * Builds the Fastify app without starting it. Everything it talks to is passed in, so tests
 * can hand it a working or an unreachable Redis.
 */
export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify({ trustProxy: deps.trustProxy ?? false, ...options });
  const ai = deps.ai ?? loadAiConfig({});
  const quota = new QuotaStore(deps.redis, { ...ai, GEMINI_TTS_MODEL: deps.speech?.config?.GEMINI_TTS_MODEL ?? loadTtsConfig({}).GEMINI_TTS_MODEL });
  const timeoutMs = deps.healthTimeoutMs ?? 1500;

  registerErrorHandling(app);
  const rooms = new RoomService(new RoomRepo(deps.redis, { ...deps.rooms, quotaModels: ai.JUDGE_AI_MODE === 'auto' || ai.AI_QUOTA_E2E ? [ai.GEMINI_MODEL, ai.GEMINI_FALLBACK_MODEL ?? ai.GEMINI_MODEL] : undefined }), deps.rooms);
  app.decorate("rooms", rooms);
  const { refreshGraceMs, ...session } = deps.session;
  app.register(sessionPlugin, {
    ...session,
    rooms,
    refreshStore: new RefreshStore(deps.redis, { graceMs: refreshGraceMs }),
  });

  registerRoomRoutes(app, rooms, new RoomLimits(deps.redis, deps.limits));
  app.get('/api/ai/status', async (_request, reply) => sendParsed(reply.header('Cache-Control', 'no-store'), AiStatus, await quota.status()));
  registerSpeechRoutes(app,new SpeechService(new SpeechRepo(deps.redis,deps.speech?.prefix),deps.speech?.config ?? loadTtsConfig({}),deps.speech?.generate,deps.speech));
  registerResultRoutes(app, new ResultsService(deps.db, deps.redis));

  // 200 when everything is up, 503 when not (same body). Load balancers and Docker health
  // checks look at the status code, so a degraded API must not answer 200.
  app.get("/api/health", async (_request, reply) => {
    const [redis, postgres] = await Promise.all([
      check(() => redisIsUp(deps.redis), timeoutMs),
      check(async () => {
        await deps.db.query("SELECT 1");
        return true;
      }, timeoutMs),
    ]);
    const body = { ok: redis === "up" && postgres === "up", redis, postgres };
    return sendParsed(reply, HealthResponse, body, body.ok ? 200 : 503);
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
