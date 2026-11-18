import { EventEmitter } from "node:events";

/** The departed identity comes from the successful leave, never from historical seat discovery. */
export interface RoomChange {
  leftPlayerId?: string;
}

/** One emitter per app; snapshots are built separately for each recipient. */
export class RoomEvents extends EventEmitter<{ roomChanged: [roomId: string, change?: RoomChange] }> {}
