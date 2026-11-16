import type { z } from "zod";
import { RoomSnapshot } from "./rooms";

/** Socket.IO event names. */
export const SOCKET_EVENTS = {
  roomSnapshot: "room:snapshot",
} as const;

/**
 * Payload of "room:snapshot": the receiving player's own RoomSnapshot, sent after every
 * change to their room. Rules 1.11 (presence), 1.17 (each player gets their own view).
 */
export const RoomSnapshotEvent = RoomSnapshot;
export type RoomSnapshotEvent = z.infer<typeof RoomSnapshotEvent>;

/** Events the server sends. Used to type Socket.IO on both sides. */
export interface ServerToClientEvents {
  "room:snapshot": (snapshot: RoomSnapshotEvent) => void;
}

/** Events the client sends. None in slice 1. */
export interface ClientToServerEvents {}
