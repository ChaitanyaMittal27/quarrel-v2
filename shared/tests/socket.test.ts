import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type RoomResponse,
  RoomSnapshotEvent,
  SOCKET_EVENTS,
  type ServerToClientEvents,
} from "../contract";

describe("socket contract", () => {
  it("names the snapshot event", () => {
    expect(SOCKET_EVENTS.roomSnapshot).toBe("room:snapshot");
  });

  it("uses RoomResponse as the payload, including nested strictness", () => {
    const room = {
      roomId: "r_8fK2mQ9xLp4TzW7a",
      code: "K7M2QX",
      version: 1,
      createdAt: "2026-11-12T18:00:00.000Z",
      expiresAt: "2026-11-13T18:00:00.000Z",
      serverNow: "2026-11-12T18:00:05.123Z",
      closed: false,
      bothReady: false, plan: null, startsAt: null, debate: null, messages: [],
      setup: { phase: "waiting", theme: "courtroom", topic: "Test", durationSec: 240, positions: { A: null, B: null } },
      you: { slot: "A" },
      players: [{ slot: "A", name: "Ann", ready: false, connected: true, left: false }],
    };
    const payload = { room };
    expect(RoomSnapshotEvent.parse(payload)).toEqual(payload);
    expect(RoomSnapshotEvent.safeParse({ ...payload, secret: 1 }).success).toBe(false);
    expect(RoomSnapshotEvent.safeParse({ room: { ...room, playerId: "hidden" } }).success).toBe(false);
    expect(RoomSnapshotEvent.safeParse(room).success).toBe(false);
  });

  it("accepts null to clear a departed player's room", () => {
    expect(RoomSnapshotEvent.parse({ room: null })).toEqual({ room: null });
  });

  it("types the server event with a RoomResponse argument", () => {
    expectTypeOf<Parameters<ServerToClientEvents["room:snapshot"]>[0]>().toEqualTypeOf<RoomResponse>();
    expectTypeOf<keyof ServerToClientEvents>().toEqualTypeOf<(typeof SOCKET_EVENTS)["roomSnapshot"]>();
  });
});
