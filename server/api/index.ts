import { Server } from "socket.io";
import { loadConfigOrExit } from "../common/config";
import { createRedis } from "../common/redis";
import { createSupabase } from "../common/supabase";
import { buildApp } from "./app";
import { registerSockets, type GameServer } from "./sockets";
import { createPlanQueue, enqueuePlan } from "../rooms/plan-queue";
import { subscribeRoomEvents } from "../rooms/room-pubsub";

const config = loadConfigOrExit();
const redis = createRedis(config.REDIS_URL);
const plans = createPlanQueue(redis);
const subscriber = createRedis(config.REDIS_URL);
const supabase = createSupabase(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const app = buildApp(
  {
    redis,
    rooms: { ensurePlan: (roomId) => enqueuePlan(plans, roomId) },
    supabase,
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

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received, shutting down`);
  try {
    await stopRoomEvents();
    await io.close(); // disconnect all tabs and stop Socket.IO's HTTP/transport handlers
    await drainSockets(); // finish presence cleanup and pending pushes before closing Redis
    await plans.close();
    await app.close(); // stop accepting requests, finish in-flight ones, close the HTTP server
    redis.disconnect();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "error during shutdown");
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
