import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type RoomSnapshot,
  RoomSnapshotEvent,
  SOCKET_EVENTS,
  type ServerToClientEvents,
} from "../contract";

describe("socket contract", () => {
  it("names the snapshot event", () => {
    expect(SOCKET_EVENTS.roomSnapshot).toBe("room:snapshot");
  });

  it("uses RoomSnapshot as the payload, including its strictness", () => {
    const payload = {
      roomId: "r_8fK2mQ9xLp4TzW7a",
      code: "K7M2QX",
      version: 1,
      createdAt: "2026-11-12T18:00:00.000Z",
      expiresAt: "2026-11-13T18:00:00.000Z",
      serverNow: "2026-11-12T18:00:05.123Z",
      closed: false,
      bothReady: false,
      you: { slot: "A" },
      players: [{ slot: "A", name: "Ann", ready: false, connected: true, left: false }],
    };
    expect(RoomSnapshotEvent.parse(payload)).toEqual(payload);
    expect(RoomSnapshotEvent.safeParse({ ...payload, secret: 1 }).success).toBe(false);
  });

  it("types the server event with a RoomSnapshot argument", () => {
    expectTypeOf<Parameters<ServerToClientEvents["room:snapshot"]>[0]>().toEqualTypeOf<RoomSnapshot>();
    expectTypeOf<keyof ServerToClientEvents>().toEqualTypeOf<(typeof SOCKET_EVENTS)["roomSnapshot"]>();
  });
});
