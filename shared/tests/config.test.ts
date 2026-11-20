import { describe, expect, it } from "vitest";
import { getTheme, getSpeechVoice, resolveCharacter, themes, isThemeId, playerCharacters, lawyers, resolveLawyer } from "../config";
import { getGameMode } from "../types";

describe("shared presentation configuration", () => {
  it("global character/lawyer catalogs have eight distinct choices each and bounded settings summaries", () => {
    expect(playerCharacters).toHaveLength(8); expect(lawyers).toHaveLength(8);
    expect(new Set([...playerCharacters, ...lawyers].map((entry) => entry.id)).size).toBe(16);
    expect(playerCharacters.find((entry) => entry.id === "detective-reporter")!.personality).toContain("reporter's");
    for (const entry of [...playerCharacters, ...lawyers]) {
      expect(Object.keys(entry).sort()).toEqual(["assetId", "description", "id", "name", "personality", ...(lawyers.some((l) => l.id === entry.id) ? ["browserVoice", "geminiVoice"] : [])].sort());
      expect(entry.name.trim()).not.toBe(""); expect(entry.description.trim()).not.toBe("");
      expect([...entry.personality].length).toBeGreaterThan(0); expect([...entry.personality].length).toBeLessThanOrEqual(400);
    }
  });
  it("recognizes configured themes and falls back safely for unknown inputs", () => {
    for (const theme of themes) {
      expect(isThemeId(theme.id)).toBe(true);
      expect(getTheme(theme.id)).toBe(theme);
      for (const slot of ["A", "B"] as const) {
        const expected = playerCharacters.find((entry) => entry.id === theme.defaults.characters[slot]);
        expect(resolveCharacter(undefined, theme, slot)).toBe(expected);
        expect(resolveCharacter("missing", theme, slot)).toBe(expected);
        expect(resolveCharacter(theme.defaults.characters[slot], theme, slot)).toBe(expected);
      }
    }
    for (const theme of themes) for (const slot of ["A", "B"] as const) {
      const fallback = lawyers.find((entry) => entry.id === theme.defaults.lawyers[slot]);
      expect(resolveLawyer(null, theme, slot)).toBe(fallback);
      expect(resolveLawyer("missing", theme, slot)).toBe(fallback);
      for (const character of playerCharacters) expect(resolveCharacter(character.id, theme, slot)).toBe(character);
      for (const lawyer of lawyers) expect(resolveLawyer(lawyer.id, theme, slot)).toBe(lawyer);
    }
    expect(isThemeId(null)).toBe(false);
    expect(getTheme("unknown")).toBe(getTheme());
    expect(getSpeechVoice("unknown", "judge")).toEqual(getSpeechVoice("courtroom", "judge"));
  });
  it("future/unknown game modes never enable more than two players", () => {
    for (const input of [undefined, null, "teams", "solo", {}, 3]) {
      expect(getGameMode(input)).toMatchObject({ id: "solo", maxPlayers: 2, slots: ["A", "B"] });
    }
  });
});
