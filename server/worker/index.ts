import { Worker } from "bullmq";
import { loadConfigOrExit } from "../common/config";
import { createQueueRedis, createRedis } from "../common/redis";
import { createPlanProcessor } from "./plan-worker";
import { PLAN_QUEUE } from "../rooms/plan-queue";
import { createDeadlineTick, startDeadlineLoop } from "./clock-worker";

const config = loadConfigOrExit();
const connection = createQueueRedis(config.REDIS_URL);
const plan = createPlanProcessor(connection, config);
// Polling fails fast during outages so shutdown never waits on an offline queue.
const deadlineRedis = createRedis(config.REDIS_URL);

const worker = new Worker(
  PLAN_QUEUE,
  plan,
  { connection },
);
worker.on("error", (error) => console.error(`[worker] ${error.message}`));

await worker.waitUntilReady();
const stopDeadlines = startDeadlineLoop(createDeadlineTick(deadlineRedis, console), console, config.DEADLINE_POLL_MS);
console.info("worker ready");

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[worker] ${signal} received, shutting down`);
  try {
    await stopDeadlines(); // clear the next tick and await the in-flight run
    deadlineRedis.disconnect();
    await worker.close(); // finish the current job (if any), take no new ones
    connection.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[worker] error during shutdown", error);
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
