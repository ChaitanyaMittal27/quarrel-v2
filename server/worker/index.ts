import { Worker } from "bullmq";
import { loadConfigOrExit } from "../common/config";
import { createQueueRedis } from "../common/redis";

const config = loadConfigOrExit();
const connection = createQueueRedis(config.REDIS_URL);

// A Worker waits for jobs on the "default" queue in Redis and runs this function for each.
// No job types exist yet, so it does nothing.
const worker = new Worker(
  "default",
  async (job) => {
    console.warn(`[worker] no handler for job "${job.name}" (${job.id}); ignoring`);
  },
  { connection },
);
worker.on("error", (error) => console.error(`[worker] ${error.message}`));

await worker.waitUntilReady();
console.info("worker ready");

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[worker] ${signal} received, shutting down`);
  try {
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
