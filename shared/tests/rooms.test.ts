import { describe, expect, it } from "vitest";
import {
  CreateRoomRequest,
  DisplayName,
  JoinRoomRequest,
  LeaveRoomResponse,
  ROOM_CODE_ALPHABET,
  RoomCode,
  RoomId,
  RoomParams,
  RoomResponse,
  RoomSnapshot,
  SetReadyRequest,
} from "../contract";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe("DisplayName (rule 1.10)", () => {
  it("uses JavaScript Unicode trim rather than SQL's ASCII-space btrim", () => {
    expect(DisplayName.parse("\u00a0\u2003Ann\u2003\u00a0")).toBe("Ann");
    expect(DisplayName.safeParse("\u00a0\u2003").success).toBe(false);
  });
  it("trims surrounding spaces", () => {
    expect(DisplayName.parse("  Ann Lee  ")).toBe("Ann Lee");
  });

  it("rejects empty and whitespace-only names", () => {
    expect(ok(DisplayName, "")).toBe(false);
    expect(ok(DisplayName, "  ")).toBe(false);
  });

  it("accepts 32 code points and rejects 33", () => {
    expect(ok(DisplayName, "a".repeat(32))).toBe(true);
    expect(ok(DisplayName, "a".repeat(33))).toBe(false);
  });

  it("counts an emoji as one character", () => {
    const name = "😀".repeat(32); // 64 UTF-16 units, 32 code points
    expect(name.length).toBe(64);
    expect(ok(DisplayName, name)).toBe(true);
    expect(ok(DisplayName, "😀".repeat(33))).toBe(false);
  });

  it("rejects control characters", () => {
    expect(ok(DisplayName, "Ann\u0007")).toBe(false);
    expect(ok(DisplayName, "Ann\nLee")).toBe(false);
    expect(ok(DisplayName, "Ann\u007F")).toBe(false);
    expect(ok(DisplayName, "Ann\u0085")).toBe(false);
  });

  it("checks control characters before trimming (as v1 does)", () => {
    expect(ok(DisplayName, "Ann\n")).toBe(false);
    expect(ok(DisplayName, "\tAnn")).toBe(false);
  });

  it("accepts ordinary punctuation and accents", () => {
    for (const name of ["O'Brien-Smith, Jr.", "Zoë", "José Ñúñez", "李雷", "a.b_c (d)!?"]) {
      expect(DisplayName.parse(name)).toBe(name);
    }
  });

  it("rejects non-strings", () => {
    expect(ok(DisplayName, 42)).toBe(false);
    expect(ok(DisplayName, null)).toBe(false);
  });
});

describe("RoomCode (rules 1.2, 1.8)", () => {
  it("trims and uppercases", () => {
    expect(RoomCode.parse("k7m2qx")).toBe("K7M2QX");
    expect(RoomCode.parse("  k7m2qx ")).toBe("K7M2QX");
  });

  it("rejects ambiguous symbols I, O, 0 and 1", () => {
    for (const code of ["K7M2QI", "K7M2QO", "K7M2Q0", "K7M2Q1", "k7m2qi", "k7m2qo"]) {
      expect(ok(RoomCode, code)).toBe(false);
    }
  });

  it("rejects the wrong length and other characters", () => {
    expect(ok(RoomCode, "K7M2Q")).toBe(false);
    expect(ok(RoomCode, "K7M2QXA")).toBe(false);
    expect(ok(RoomCode, "")).toBe(false);
    expect(ok(RoomCode, "K7M-QX")).toBe(false);
  });

  it("has an alphabet of 32 unique symbols, all of which are valid", () => {
    const symbols = [...ROOM_CODE_ALPHABET];
    expect(symbols).toHaveLength(32);
    expect(new Set(symbols).size).toBe(32);
    for (const symbol of symbols) {
      expect(ok(RoomCode, symbol.repeat(6))).toBe(true);
    }
    for (const banned of ["I", "O", "0", "1"]) {
      expect(ROOM_CODE_ALPHABET).not.toContain(banned);
    }
  });
});

describe("RoomId", () => {
  it("accepts r_ plus 16–32 URL-safe characters", () => {
    expect(ok(RoomId, "r_" + "a".repeat(16))).toBe(true);
    expect(ok(RoomId, "r_" + "A-_9".repeat(8))).toBe(true);
  });

  it("rejects other shapes", () => {
    expect(ok(RoomId, "r_" + "a".repeat(15))).toBe(false);
    expect(ok(RoomId, "r_" + "a".repeat(33))).toBe(false);
    expect(ok(RoomId, "x_" + "a".repeat(16))).toBe(false);
    expect(ok(RoomId, "r_" + "a".repeat(15) + "!")).toBe(false);
  });

  it("is used by RoomParams", () => {
    expect(ok(RoomParams, { roomId: "r_" + "a".repeat(20) })).toBe(true);
    expect(ok(RoomParams, { roomId: "nope" })).toBe(false);
  });
});

describe("request bodies", () => {
  it("CreateRoomRequest trims the name", () => {
    expect(CreateRoomRequest.parse({ name: " Ann " })).toEqual({ name: "Ann" });
    expect(ok(CreateRoomRequest, {})).toBe(false);
  });

  it("JoinRoomRequest normalises code and name", () => {
    expect(JoinRoomRequest.parse({ code: "k7m2qx", name: " Bo " })).toEqual({
      code: "K7M2QX",
      name: "Bo",
    });
    expect(ok(JoinRoomRequest, { code: "K7M2QX" })).toBe(false);
  });
});

describe("SetReadyRequest (rule 1.13)", () => {
  it("accepts true and false", () => {
    expect(SetReadyRequest.parse({ ready: true })).toEqual({ ready: true });
    expect(SetReadyRequest.parse({ ready: false })).toEqual({ ready: false });
  });

  it("rejects null, missing and strings", () => {
    expect(ok(SetReadyRequest, { ready: null })).toBe(false);
    expect(ok(SetReadyRequest, {})).toBe(false);
    expect(ok(SetReadyRequest, { ready: "true" })).toBe(false);
  });
});

// ---- snapshots ------------------------------------------------------------------------------

const playerA = { slot: "A", name: "Ann", ready: true, connected: true, left: false };
const playerB = { slot: "B", name: "Bo", ready: false, connected: true, left: false };

const onePlayer = {
  roomId: "r_8fK2mQ9xLp4TzW7a",
  code: "K7M2QX",
  version: 0,
  createdAt: "2026-11-12T18:00:00.000Z",
  expiresAt: "2026-11-13T18:00:00.000Z",
  serverNow: "2026-11-12T18:00:05.123Z",
  closed: false,
  bothReady: false,
  you: { slot: "A" },
  players: [playerA],
};

const twoPlayers = { ...onePlayer, version: 3, you: { slot: "B" }, players: [playerA, playerB] };

describe("RoomSnapshot (rules 1.7, 1.17)", () => {
  it("accepts a valid 1-player and 2-player room", () => {
    expect(RoomSnapshot.parse(onePlayer)).toEqual(onePlayer);
    expect(RoomSnapshot.parse(twoPlayers)).toEqual(twoPlayers);
  });

  it("rejects an extra key on a player (e.g. a player ID)", () => {
    const leaky = { ...twoPlayers, players: [{ ...playerA, playerId: "u_123" }, playerB] };
    expect(ok(RoomSnapshot, leaky)).toBe(false);
  });

  it("rejects an extra key on the room or on `you`", () => {
    expect(ok(RoomSnapshot, { ...onePlayer, playerId: "u_123" })).toBe(false);
    expect(ok(RoomSnapshot, { ...onePlayer, you: { slot: "A", playerId: "u_123" } })).toBe(false);
  });

  it("rejects 0 or 3 players", () => {
    expect(ok(RoomSnapshot, { ...onePlayer, players: [] })).toBe(false);
    expect(ok(RoomSnapshot, { ...twoPlayers, players: [playerA, playerB, playerB] })).toBe(false);
  });

  it("rejects duplicate slots", () => {
    expect(ok(RoomSnapshot, { ...twoPlayers, players: [playerA, playerA] })).toBe(false);
  });

  it("rejects B before A, and B alone", () => {
    expect(ok(RoomSnapshot, { ...twoPlayers, players: [playerB, playerA] })).toBe(false);
    expect(ok(RoomSnapshot, { ...onePlayer, you: { slot: "B" }, players: [playerB] })).toBe(false);
  });

  it("rejects `you` pointing at a missing or departed seat", () => {
    expect(ok(RoomSnapshot, { ...onePlayer, you: { slot: "B" } })).toBe(false);
    const departedB = { ...playerB, left: true, ready: false, connected: false };
    expect(ok(RoomSnapshot, { ...twoPlayers, players: [playerA, departedB] })).toBe(false);
    // The remaining player can still see a closed room with the departed seat (rule 1.15).
    expect(
      ok(RoomSnapshot, { ...twoPlayers, you: { slot: "A" }, closed: true, players: [playerA, departedB] }),
    ).toBe(true);
  });

  it("rejects bad field values", () => {
    expect(ok(RoomSnapshot, { ...onePlayer, version: -1 })).toBe(false);
    expect(ok(RoomSnapshot, { ...onePlayer, version: 1.5 })).toBe(false);
    expect(ok(RoomSnapshot, { ...onePlayer, code: "k7m2qx" })).toBe(false);
    expect(ok(RoomSnapshot, { ...onePlayer, createdAt: "today" })).toBe(false);
    expect(ok(RoomSnapshot, { ...onePlayer, players: [{ ...playerA, ready: "yes" }] })).toBe(false);
  });
});

describe("RoomResponse / LeaveRoomResponse", () => {
  it("accepts { room: null } and a room", () => {
    expect(RoomResponse.parse({ room: null })).toEqual({ room: null });
    expect(ok(RoomResponse, { room: onePlayer })).toBe(true);
  });

  it("rejects a missing room key and extra keys", () => {
    expect(ok(RoomResponse, {})).toBe(false);
    expect(ok(RoomResponse, { room: null, extra: true })).toBe(false);
  });

  it("leave always returns no room", () => {
    expect(LeaveRoomResponse.parse({ room: null })).toEqual({ room: null });
    expect(ok(LeaveRoomResponse, { room: onePlayer })).toBe(false);
  });
});
