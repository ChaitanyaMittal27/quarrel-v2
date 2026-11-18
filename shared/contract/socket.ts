import type { z } from "zod";
import { RoomResponse } from "./rooms";

/** Socket.IO event names. */
export const SOCKET_EVENTS = {
  roomSnapshot: "room:snapshot",
} as const;

/**
 * The receiving player's own room, or null after leaving. Rules 1.11 and 1.17.
 * Clients ignore lower versions of the same room; equal versions include presence changes.
 */
export const RoomSnapshotEvent = RoomResponse;
export type RoomSnapshotEvent = z.infer<typeof RoomSnapshotEvent>;

/** Events the server sends. Used to type Socket.IO on both sides. */
export interface ServerToClientEvents {
  "room:snapshot": (snapshot: RoomSnapshotEvent) => void;
}

/** Events the client sends. None in slice 1. */
export interface ClientToServerEvents {}
