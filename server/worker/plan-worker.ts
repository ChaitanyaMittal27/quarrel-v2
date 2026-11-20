import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import { DebatePlan, PlanOutput } from "@quarrel/shared/contract";
import type { LawyerJob } from "@quarrel/shared/types";
import type { AiConfig } from "../common/config";
import { RoomRepo } from "../rooms/room-repo";
import { PLAN_ATTEMPTS, type PlanJobData } from "../rooms/plan-queue";
import { ROOM_EVENTS_CHANNEL } from "../rooms/room-pubsub";
import { generateLawyerResult } from "./ai/judge-engine";
import { deterministicLawyerResult } from "./ai/lawyer-policy";
import { QuotaStore } from '../ai/quota-store';
import { JuryUnavailableError } from './ai/lawyer-errors';

export function createPlanProcessor(redis: Redis, config: AiConfig, generate = generateLawyerResult) {
  const repo = new RoomRepo(redis);
  const quota = new QuotaStore(redis, config);
  return async (job: Job<PlanJobData>): Promise<void> => {
    if (job.name !== "plan") throw new Error("UNKNOWN_JOB");
    const { roomId } = job.data;
    const fields = await repo.readRoom(roomId);
    const [seconds, micros] = await redis.time();
    const now = Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
    if (job.data.debateId && job.data.debateId !== fields.debateId) return;
    if (fields.phase !== "planning" || fields.closed === "1" || Number(fields.expiresAt) <= now) return;
    // A previous attempt may have saved successfully but failed to publish. Re-publish safely.
    if (fields.plan) { await redis.publish(ROOM_EVENTS_CHANNEL, roomId); return; }
    const ai = config.JUDGE_AI_MODE === "auto" && Boolean(config.GEMINI_API_KEY);
    const request: LawyerJob = {
      id: job.id!, kind: "plan", mode: ai ? "ai" : "demo", slot: null, playerText: null,
      context: {
        themeId: fields.theme!, topic: fields.topic!, totalSeconds: Number(fields.durationSec),
        players: (["a", "b"] as const).map((seat) => ({
          slot: seat === "a" ? "A" : "B", name: fields[`${seat}.name`]!, position: fields[`${seat}.position`]!,
        })), subtopics: [], currentSubtopic: null, messages: [],
      },
    };
    let output: PlanOutput;
    let source: DebatePlan["source"];
    try {
      if (ai && (await quota.status()).text === 'exhausted') throw new JuryUnavailableError('quota_exhausted', false);
      const result = ai ? await generate(request, config, true, quota) : deterministicLawyerResult(request);
      const { kind: _kind, source: resultSource, ...raw } = result;
      output = PlanOutput.parse(raw);
      if (output.subtopics.reduce((sum, item) => sum + item.secondsPerPlayer, 0) !== request.context.totalSeconds
        || ai && resultSource !== "ai") throw new Error("INVALID_PLAN");
      source = resultSource;
    } catch (error) {
      // Retry numbers come from BullMQ, never a local sleep loop. Do not expose provider errors.
      if (!(error instanceof JuryUnavailableError && error.reasonCode === 'quota_exhausted') && job.attemptsMade + 1 < (job.opts.attempts ?? PLAN_ATTEMPTS)) throw new Error("PLAN_GENERATION_FAILED");
      const { kind: _kind, source: _source, ...fallback } = deterministicLawyerResult(request, "fallback");
      output = PlanOutput.parse(fallback);
      source = "fallback";
    }
    const plan = DebatePlan.parse({ ...output, source, subtopics: output.subtopics.map((item, index) => ({
      ...item, openerSlot: index % 2 === 0 ? "A" : "B",
    })) });
    const result = await repo.savePlan(roomId, plan, fields.debateId);
    if (result.status !== "OK") throw new Error("PLAN_SAVE_FAILED");
    if (result.changed) await redis.publish(ROOM_EVENTS_CHANNEL, roomId);
  };
}
