import { Server } from "socket.io";
import { loadConfigOrExit } from "../common/config";
import { createRedis } from "../common/redis";
import { createDb } from "../common/db";
import { migrate } from "../db/migrate";
import { buildApp } from "./app";
import { registerSockets, type GameServer } from "./sockets";
import { createPlanQueue, enqueuePlan, enqueueLawyer, enqueueJudge, enqueueArchive } from "../rooms/plan-queue";
import { subscribeRoomEvents } from "../rooms/room-pubsub";
import { createDeadlineTick, startDeadlineLoop } from "../worker/clock-worker";

const config = loadConfigOrExit();
const redis = createRedis(config.REDIS_URL);
const plans = createPlanQueue(redis);
const ensureJudge: import("../rooms/plan-queue").EnsureJudge = (roomId, judge) => enqueueJudge(plans, roomId, judge);
const subscriber = createRedis(config.REDIS_URL);
const deadlineRedis = createRedis(config.REDIS_URL);
const db = createDb(config.DATABASE_URL);
await migrate(db);
const app = buildApp(
  {
    redis,
    rooms: { ensureJudge, summaryTimeoutMs: config.SUMMARY_WORK_TIMEOUT_MS, ensureArchive: (roomId, debateId) => enqueueArchive(plans, roomId, debateId), ensurePlan: (roomId, debateId) => enqueuePlan(plans, roomId, debateId),
      ensureLawyer: (roomId, workId) => enqueueLawyer(plans, roomId, workId), workTimeoutMs: config.LAWYER_WORK_TIMEOUT_MS },
    db,
    session: {
      secret: config.SESSION_SECRET,
      previousSecret: config.SESSION_SECRET_PREVIOUS,
      cookieSecure: config.COOKIE_SECURE,
    },
  },
  { logger: true },
);

// Socket.IO shares the API's HTTP server and port; it only handles URLs under /socket.io.
await app.ready();
const io: GameServer = new Server(app.server, { path: "/socket.io" });
const drainSockets = registerSockets(io, app.rooms, redis, {
  verifyKeys: app.sessions.verifyKeys, logger: app.log,
});
const stopRoomEvents = await subscribeRoomEvents(subscriber, app.rooms, app.log);

await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
// Worker death must not also disable its work-timeout fallback. The Lua transitions are
// idempotent, so API/worker pollers may safely observe the same due member.
const stopDeadlines = startDeadlineLoop(createDeadlineTick(deadlineRedis, app.log, { ensureJudge, summaryTimeoutMs: config.SUMMARY_WORK_TIMEOUT_MS }), app.log, config.DEADLINE_POLL_MS);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received, shutting down`);
  try {
    await stopDeadlines();
    deadlineRedis.disconnect();
    await stopRoomEvents();
    await io.close(); // disconnect all tabs and stop Socket.IO's HTTP/transport handlers
    await drainSockets(); // finish presence cleanup and pending pushes before closing Redis
    await plans.close();
    await app.close(); // stop accepting requests, finish in-flight ones, close the HTTP server
    await db.end();
    redis.disconnect();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "error during shutdown");
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
