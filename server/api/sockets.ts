import { fastifyCookie } from "@fastify/cookie";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { Server, Socket } from "socket.io";
import {
  RoomSnapshotEvent, type ClientToServerEvents, type ServerToClientEvents,
} from "@quarrel/shared/contract";
import { verifyAccessToken } from "../common/tokens";
import { RoomRepo } from "../rooms/room-repo";
import type { RoomService } from "../rooms/room-service";
import type { RoomChange } from "../rooms/room-events";
import { ACCESS_COOKIE } from "./session";

interface SocketData { playerId: string }
interface InterServerEvents {}
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
const channel = (playerId: string) => `player:${playerId}`;

export interface SocketOptions {
  verifyKeys: readonly Uint8Array[];
  logger: Pick<FastifyBaseLogger, "debug">;
}

/** Register once per API server. Close io first, then drain this wiring before closing Redis. */
export function registerSockets(io: GameServer, rooms: RoomService, redis: Redis, options: SocketOptions) {
  const repo = new RoomRepo(redis);
  const playerWork = new Map<string, Promise<void>>();
  let pushes = Promise.resolve();

  const debug = (error: unknown) => options.logger.debug({ err: error }, "socket update skipped");

  // A tab closing during an awaited SET must not recreate presence after its final DEL.
  function forPlayer(playerId: string, action: () => Promise<void>): void {
    const work = (playerWork.get(playerId) ?? Promise.resolve()).then(action).catch(debug);
    playerWork.set(playerId, work);
    void work.then(() => { if (playerWork.get(playerId) === work) playerWork.delete(playerId); });
  }

  async function sendCurrent(playerId: string, target: Pick<GameSocket, "emit">): Promise<void> {
    try {
      const payload = RoomSnapshotEvent.parse(await rooms.current(playerId));
      target.emit("room:snapshot", payload);
    } catch (error) {
      debug(error); // One expired room or invalid response must not break other recipients.
    }
  }

  function roomChanged(roomId: string, change?: RoomChange): void {
    // Keep equal-version presence updates and leave notifications in event order.
    pushes = pushes.then(async () => {
      if (change?.leftPlayerId) {
        io.to(channel(change.leftPlayerId)).emit("room:snapshot", RoomSnapshotEvent.parse({ room: null }));
      }
      for (const playerId of await rooms.seatedPlayerIds(roomId)) {
        await sendCurrent(playerId, io.to(channel(playerId)));
      }
    }).catch(debug);
  }
  rooms.events.on("roomChanged", roomChanged);

  io.use((socket, next) => {
    void (async () => {
      const token = fastifyCookie.parse(socket.handshake.headers.cookie ?? "")[ACCESS_COOKIE];
      if (!token) return next(new Error("UNAUTHENTICATED"));
      const identity = await verifyAccessToken(token, options.verifyKeys);
      if (identity === "expired") return next(new Error("SESSION_EXPIRED"));
      if (identity === "invalid") return next(new Error("UNAUTHENTICATED"));
      socket.data.playerId = identity.playerId;
      return next();
    })().catch(() => next(new Error("UNAUTHENTICATED")));
  });

  io.on("connection", (socket) => {
    const playerId = socket.data.playerId;
    // Keep trying through a Redis outage, including one during the initial presence SET.
    const interval = setInterval(() => {
      forPlayer(playerId, async () => {
        if (socket.connected) await repo.refreshPresence(playerId);
      });
    }, 10_000);
    interval.unref();
    socket.on("disconnect", () => {
      clearInterval(interval);
      forPlayer(playerId, async () => {
        if ((await io.in(channel(playerId)).fetchSockets()).length > 0) return;
        if (await repo.clearPresence(playerId)) await rooms.presenceChanged(playerId);
      });
    });

    forPlayer(playerId, async () => {
      await socket.join(channel(playerId));
      if (!socket.connected) return;
      const first = (await io.in(channel(playerId)).fetchSockets()).length === 1;
      await repo.refreshPresence(playerId);
      if (first) await rooms.presenceChanged(playerId);
      await sendCurrent(playerId, socket);
    });
  });

  return async function drain(): Promise<void> {
    await Promise.all(playerWork.values());
    await pushes;
    rooms.events.off("roomChanged", roomChanged);
  };
}
