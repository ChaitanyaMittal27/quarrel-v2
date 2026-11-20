import { describe, expect, it } from "vitest";
import { themes } from "../config";
import { CreateRoomRequest, PositionText, RoomSetup, SetPositionRequest, Topic } from "../contract";

describe("Slice 2 contract", () => {
  it("rule S2.1: request defaults match config theme IDs and supported durations", () => {
    expect(CreateRoomRequest.parse({ name: "Ann", topic: " Topic " })).toEqual({ name: "Ann", topic: "Topic", theme: "courtroom", durationSec: 240 });
    for (const theme of themes) {
      for (const durationSec of [120, 240, 360, 600]) {
        expect(CreateRoomRequest.parse({ name: "Ann", topic: "Topic", theme: theme.id, durationSec })).toMatchObject({ theme: theme.id, durationSec });
      }
    }
  });
  it("rule S2.1: topic trims whitespace, counts code points and rejects every raw control character", () => {
    expect(Topic.parse("\u00a0 Topic \u2003")).toBe("Topic");
    expect(Topic.parse("😀".repeat(240))).toHaveLength(480);
    for (const value of ["", " ", "😀".repeat(241), null, 1]) expect(Topic.safeParse(value).success).toBe(false);
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), ...Array.from({ length: 33 }, (_, index) => 127 + index)]) {
      expect(Topic.safeParse(`Topic${String.fromCodePoint(code)}`).success).toBe(false);
    }
  });
  it("rule S2.3: only tab and newline controls are allowed; positions count code points after trimming", () => {
    expect(SetPositionRequest.parse({ text: "  A\n\tB  " })).toEqual({ text: "A\n\tB" });
    expect(PositionText.parse("😀".repeat(600))).toHaveLength(1200);
    expect(PositionText.safeParse("😀".repeat(601)).success).toBe(false);
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), ...Array.from({ length: 33 }, (_, index) => 127 + index)]) {
      expect(PositionText.safeParse(`A${String.fromCodePoint(code)}B`).success).toBe(code === 9 || code === 10);
    }
  });
  it("rule S2.4: setup and positions responses are strict, with every field required", () => {
    const setup = { phase: "positions", theme: "courtroom", topic: "Topic", durationSec: 240, positions: { A: "A view", B: null } };
    expect(RoomSetup.parse(setup)).toEqual(setup);
    expect(RoomSetup.safeParse({ ...setup, revision: 1 }).success).toBe(false);
    expect(RoomSetup.safeParse({ ...setup, positions: { ...setup.positions, playerId: "hidden" } }).success).toBe(false);
    for (const field of Object.keys(setup)) {
      expect(RoomSetup.safeParse(Object.fromEntries(Object.entries(setup).filter(([key]) => key !== field))).success).toBe(false);
    }
    expect(RoomSetup.safeParse({ ...setup, phase: "unknown" }).success).toBe(false);
  });
});
