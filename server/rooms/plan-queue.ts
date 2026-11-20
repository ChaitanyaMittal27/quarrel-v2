import { Queue } from "bullmq";
import type { RoomResult } from "./room-repo";
import type { Redis } from "ioredis";

export const PLAN_QUEUE = "default";
export const PLAN_ATTEMPTS = 3;
export type EnsureJudge = (roomId: string, judge: NonNullable<RoomResult["judge"]>) => Promise<void>;
export interface ArchiveJobData { roomId: string; debateId: string }
export type EnsureArchive = (roomId: string, debateId: string) => Promise<void>;
export function queueBackoff(attempt: number, type?: string): number { return type === "archive" ? Math.min(30000, 1000 * 2 ** Math.min(20, attempt - 1)) : juryBackoff(attempt); }
export async function enqueueArchive(queue: ReturnType<typeof createPlanQueue>, roomId: string, debateId: string) {
  // The pinned BullMQ rejects two-segment colon IDs; use its stable hyphen equivalent.
  await queue.add("archive", { roomId, debateId }, { jobId: `archive-${debateId}`, attempts: 2147483647, backoff: { type: "archive" } });
}
export interface JudgeJobData { debateId?: string; roomId: string; kind: "summary" | "jury"; index: number; workId?: string }
export function juryBackoff(attemptsMade: number): number { return attemptsMade <= 1 ? 5000 : 15000; }
export async function enqueueJudge(queue: ReturnType<typeof createPlanQueue>, roomId: string, judge: NonNullable<RoomResult["judge"]>): Promise<void> {
  await queue.add(judge.kind, { roomId, ...judge }, { jobId: `${judge.kind}:${roomId}:${judge.debateId ? `${judge.debateId}-` : ""}${judge.index}`,
    attempts: judge.kind === "jury" ? 3 : 1, ...(judge.kind === "jury" ? { backoff: { type: "jury" } } : {}) });
}
export interface PlanJobData { roomId: string; debateId?: string }
export interface LawyerJobData { roomId: string; workId: string }

export function createPlanQueue(connection: Redis, name = PLAN_QUEUE) {
  return new Queue<PlanJobData | LawyerJobData | JudgeJobData | ArchiveJobData, void, "plan" | "lawyer" | "summary" | "jury" | "archive">(name, {
    connection,
    defaultJobOptions: {
      attempts: PLAN_ATTEMPTS, backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 172800 }, removeOnFail: true,
    },
  });
}

export async function enqueueLawyer(queue: ReturnType<typeof createPlanQueue>, roomId: string, workId: string): Promise<void> {
  // This three-segment ID is accepted by the pinned BullMQ and deduplicates read recovery.
  await queue.add("lawyer", { roomId, workId }, { jobId: `lawyer:${roomId}:${workId}`, attempts: 1 });
}

export async function enqueuePlan(queue: ReturnType<typeof createPlanQueue>, roomId: string, debateId?: string): Promise<void> {
  // BullMQ rejects the requested two-segment colon ID; this stable ID has the same semantics.
  await queue.add("plan", { roomId, ...(debateId ? { debateId } : {}) }, { jobId: `plan-${debateId ?? roomId}` });
}
