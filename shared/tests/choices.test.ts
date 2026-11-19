import { describe, expect, it } from "vitest";
import { SetChoicesRequest, PlayerView } from "../contract";
import { playerCharacters, lawyers } from "../config";

describe("Stage 5B choice contracts", () => {
  it("rule 5B.2: choice requests are strict, catalog-backed and require at least one field", () => {
    for (const entry of playerCharacters) expect(SetChoicesRequest.parse({ characterId: entry.id })).toEqual({ characterId: entry.id });
    for (const entry of lawyers) expect(SetChoicesRequest.parse({ lawyerId: entry.id })).toEqual({ lawyerId: entry.id });
    expect(SetChoicesRequest.parse({ characterId: playerCharacters[0]!.id, lawyerId: lawyers[0]!.id })).toBeTruthy();
    for (const body of [{}, null, [], { characterId: "" }, { lawyerId: "missing" }, { characterId: lawyers[0]!.id }, { characterId: undefined }, { characterId: playerCharacters[0]!.id, slot: "B" }]) expect(SetChoicesRequest.safeParse(body).success).toBe(false);
  });
  it("rule 5B.3: snapshots require both resolved catalog IDs, including a retained left seat", () => {
    const player = { slot: "A", name: "Ann", ready: false, connected: true, left: false, characterId: playerCharacters[0]!.id, lawyerId: lawyers[0]!.id };
    expect(PlayerView.parse(player)).toEqual(player);
    expect(PlayerView.parse({ ...player, left: true }).characterId).toBe(player.characterId);
    for (const patch of [{ characterId: "" }, { characterId: undefined }, { lawyerId: "bad" }, { lawyerId: undefined }, { slotOverride: "B" }]) expect(PlayerView.safeParse({ ...player, ...patch }).success).toBe(false);
  });
});
