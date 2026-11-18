import { describe, expect, it } from "vitest";
import { getTheme, getSpeechVoice, resolvePlayerCharacter, themes, isThemeId } from "../config";
import { getGameMode } from "../types";

describe("shared presentation configuration", () => {
  it("recognizes configured themes and falls back safely for unknown inputs", () => {
    for (const theme of themes) {
      expect(isThemeId(theme.id)).toBe(true);
      expect(getTheme(theme.id)).toBe(theme);
      for (const slot of ["A", "B"] as const) {
        const expected = theme.players.characters[theme.players.defaults[slot]];
        expect(resolvePlayerCharacter(theme, slot)).toBe(expected);
        expect(resolvePlayerCharacter(theme, slot, "missing")).toBe(expected);
        expect(resolvePlayerCharacter(theme, slot, theme.players.defaults[slot])).toBe(expected);
      }
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
