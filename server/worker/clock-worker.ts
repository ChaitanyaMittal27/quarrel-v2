import type { Redis } from "ioredis";
import { RoomRepo, type RoomRepoOptions } from "../rooms/room-repo";
import { ROOM_EVENTS_CHANNEL } from "../rooms/room-pubsub";

type Logger = Pick<Console, "error">;

export function createDeadlineTick(redis: Redis, logger: Logger, options: RoomRepoOptions & { ensureJudge?: import("../rooms/plan-queue").EnsureJudge } = {}) {
  const repo = new RoomRepo(redis, options);
  return async (): Promise<void> => {
    const rooms = await repo.due(100);
    for (const roomId of rooms) {
      try {
        // Two pollers may see the same member. Atomic catch-up is idempotent; at worst a
        // duplicate publish is harmless. Selection never removes work before it is applied.
        const result = await repo.catchup(roomId);
        if (result.judge) await options.ensureJudge?.(roomId, result.judge);
        if (result.changed) await redis.publish(ROOM_EVENTS_CHANNEL, roomId);
      } catch {
        logger.error("deadline catch-up failed", { roomId });
      }
    }
  };
}

/** Delay after completion rather than setInterval: slow/erroring runs never overlap. */
export function startDeadlineLoop(tick: () => Promise<void>, logger: Logger, intervalMs = 250): () => Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function run(): Promise<void> {
    try { await tick(); }
    catch { logger.error("deadline poll failed"); }
    finally { if (!stopped) timer = setTimeout(() => { running = run(); }, intervalMs); }
  }
  let running = run();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
