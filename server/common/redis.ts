import { Redis } from "ioredis";

/**
 * Redis client for the API. It fails fast: while Redis is unreachable, commands are rejected
 * immediately instead of waiting in a queue, so a request (like /api/health) never hangs.
 * It keeps trying to reconnect in the background, so it recovers when Redis comes back.
 */
export function createRedis(url: string): Redis {
  const redis = new Redis(url, {
    connectTimeout: 1000,
    enableOfflineQueue: false, // don't hold commands while disconnected: reject them
    maxRetriesPerRequest: 0, // don't retry a failed command
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000), // reconnect, at most every 2s
  });
  logConnectionErrors(redis, "redis");
  return redis;
}

/**
 * Redis connection for BullMQ. BullMQ needs `maxRetriesPerRequest: null` so its blocking
 * commands wait for Redis to come back instead of crashing the worker.
 */
export function createQueueRedis(url: string): Redis {
  const redis = new Redis(url, { maxRetriesPerRequest: null });
  logConnectionErrors(redis, "queue redis");
  return redis;
}

/**
 * True if Redis answers PING. While the client is still making its first connection, waits
 * for that attempt to succeed or fail; if it is already known to be disconnected, answers
 * false straight away. Callers should still add a timeout.
 */
export async function redisIsUp(redis: Redis): Promise<boolean> {
  if (redis.status === "connecting" || redis.status === "connect" || redis.status === "wait") {
    const connected = await new Promise<boolean>((resolve) => {
      const done = (value: boolean) => {
        redis.off("ready", onReady);
        redis.off("error", onFail);
        redis.off("close", onFail);
        resolve(value);
      };
      const onReady = () => done(true);
      const onFail = () => done(false);
      redis.once("ready", onReady);
      redis.once("error", onFail);
      redis.once("close", onFail);
    });
    if (!connected) return false;
  }
  if (redis.status !== "ready") return false;
  return (await redis.ping()) === "PONG";
}

/** Log a connection error once per outage, not on every reconnect attempt. */
function logConnectionErrors(redis: Redis, label: string): void {
  let down = false;
  redis.on("error", (error: Error) => {
    if (!down) console.warn(`[${label}] connection error: ${error.message}`);
    down = true;
  });
  redis.on("ready", () => {
    if (down) console.info(`[${label}] reconnected`);
    down = false;
  });
}
