import { Worker } from "bullmq";
import { loadConfigOrExit } from "../common/config";
import { createQueueRedis, createRedis } from "../common/redis";
import { createDb } from "../common/db";
import { createArchiveProcessor } from "./archive-worker";
import type { ArchiveJobData } from "../rooms/plan-queue";
import { createPlanProcessor } from "./plan-worker";
import { createLawyerProcessor } from "./lawyer-worker";
import type { Job } from "bullmq";
import type { LawyerJobData } from "../rooms/plan-queue";
import { createJudgeProcessor } from "./judge-worker";
import type { JudgeJobData } from "../rooms/plan-queue";
import { PLAN_QUEUE, createPlanQueue, enqueueJudge, enqueueArchive, queueBackoff } from "../rooms/plan-queue";
import { createDeadlineTick, startDeadlineLoop } from "./clock-worker";

const config = loadConfigOrExit();
const connection = createQueueRedis(config.REDIS_URL);
// Producers used by a deadline tick must fail fast too, so an outage cannot block stop().
const deadlineRedis = createRedis(config.REDIS_URL);
const db = createDb(config.DATABASE_URL);
const archive = createArchiveProcessor(connection, db);
const plan = createPlanProcessor(connection, config);
const queue = createPlanQueue(deadlineRedis);
const ensureJudge: import("../rooms/plan-queue").EnsureJudge = (roomId, judge) => enqueueJudge(queue, roomId, judge);
const ensureArchive: import("../rooms/plan-queue").EnsureArchive = (roomId, debateId) => enqueueArchive(queue, roomId, debateId);
const options = { ensureArchive, ensureJudge, summaryTimeoutMs: config.SUMMARY_WORK_TIMEOUT_MS };
const lawyer = createLawyerProcessor(connection, config, undefined, options);
const judge = createJudgeProcessor(connection, config, undefined, options);
// Polling fails fast during outages so shutdown never waits on an offline queue.

const worker = new Worker(
  PLAN_QUEUE,
  (job) => job.name === "archive" ? archive(job as Job<ArchiveJobData>) : job.name === "lawyer" ? lawyer(job as Job<LawyerJobData>) : job.name === "summary" || job.name === "jury" ? judge(job as Job<JudgeJobData>) : plan(job),
  { connection, settings: { backoffStrategy: queueBackoff } },
);
worker.on("error", (error) => console.error(`[worker] ${error.message}`));

await worker.waitUntilReady();
const stopDeadlines = startDeadlineLoop(createDeadlineTick(deadlineRedis, console, options), console, config.DEADLINE_POLL_MS);
console.info("worker ready");

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[worker] ${signal} received, shutting down`);
  try {
    await stopDeadlines(); // clear the next tick and await the in-flight run
    await worker.close(); // finish the current job (if any), take no new ones
    await queue.close();
    deadlineRedis.disconnect();
    await db.end();
    connection.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[worker] error during shutdown", error);
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
