import { Server } from "socket.io";
import { loadConfigOrExit } from "../common/config";
import { createRedis } from "../common/redis";
import { createSupabase } from "../common/supabase";
import { buildApp } from "./app";

const config = loadConfigOrExit();
const redis = createRedis(config.REDIS_URL);
const supabase = createSupabase(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const app = buildApp(
  {
    redis,
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
const io = new Server(app.server, { path: "/socket.io" });
io.on("connection", (socket) => {
  app.log.info({ socketId: socket.id }, "socket connected");
  socket.on("disconnect", (reason) => {
    app.log.info({ socketId: socket.id, reason }, "socket disconnected");
  });
});

await app.listen({ port: config.API_PORT, host: "0.0.0.0" });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received, shutting down`);
  try {
    io.disconnectSockets(true); // tell connected clients goodbye
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
