import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export const PLAN_QUEUE = "default";
export const PLAN_ATTEMPTS = 3;
export interface PlanJobData { roomId: string }

export function createPlanQueue(connection: Redis, name = PLAN_QUEUE) {
  return new Queue<PlanJobData, void, "plan">(name, {
    connection,
    defaultJobOptions: {
      attempts: PLAN_ATTEMPTS, backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 172800 }, removeOnFail: true,
    },
  });
}

export async function enqueuePlan(queue: ReturnType<typeof createPlanQueue>, roomId: string): Promise<void> {
  // BullMQ rejects the requested two-segment colon ID; this stable ID has the same semantics.
  await queue.add("plan", { roomId }, { jobId: `plan-${roomId}` });
}
