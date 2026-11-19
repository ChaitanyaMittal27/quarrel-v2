import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import { RoomId } from "@quarrel/shared/contract";
import { redisIsUp } from "../common/redis";
import type { RoomService } from "./room-service";

export const ROOM_EVENTS_CHANNEL = "room-events";

/** The caller supplies a dedicated connection: a subscriber cannot run normal Redis commands. */
export async function subscribeRoomEvents(subscriber: Redis, rooms: RoomService, logger: Pick<FastifyBaseLogger, "debug">) {
  try {
    if (!(await redisIsUp(subscriber))) throw new Error("Redis subscriber unavailable");
  } catch {
    subscriber.disconnect();
    throw new Error("Redis subscriber unavailable");
  }
  const message = (channel: string, value: string) => {
    const parsed = RoomId.safeParse(value);
    if (channel === ROOM_EVENTS_CHANNEL && parsed.success) rooms.events.emit("roomChanged", parsed.data);
    else logger.debug("invalid room event skipped");
  };
  subscriber.on("message", message);
  try { await subscriber.subscribe(ROOM_EVENTS_CHANNEL); }
  catch (error) { subscriber.off("message", message); subscriber.disconnect(); throw error; }
  return async () => {
    subscriber.off("message", message);
    try { await subscriber.unsubscribe(ROOM_EVENTS_CHANNEL); }
    finally { subscriber.disconnect(); }
  };
}
