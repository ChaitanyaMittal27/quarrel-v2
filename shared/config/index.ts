import { jungle } from "./jungle";
import { superhero } from "./superhero";
import { detective } from "./detective";
import { courtroom } from "./courtroom";
import type { CharacterPosition, ThemeConfig, ThemeId } from "./types";
import { playerCharacters, lawyers } from "./catalog";

export * from "./types";
export * from "./catalog";
export const themes: readonly ThemeConfig[] = [jungle, superhero, detective, courtroom];
export const themeRegistry: Readonly<Record<ThemeId, ThemeConfig>> = { jungle, superhero, detective, courtroom };
export const DEFAULT_THEME_ID: ThemeId = "courtroom";
export function isThemeId(id: unknown): id is ThemeId {
  return typeof id === "string" && Object.hasOwn(themeRegistry, id);
}
/** Safe at the rendering boundary; invalid writes are rejected by the API/DB. */
export function getTheme(id: unknown = DEFAULT_THEME_ID): ThemeConfig {
  return isThemeId(id) ? themeRegistry[id] : themeRegistry[DEFAULT_THEME_ID];
}
export function resolveCharacter(id: string | null | undefined, theme: ThemeConfig, slot: CharacterPosition) {
  return playerCharacters.find((entry) => entry.id === id)
    ?? playerCharacters.find((entry) => entry.id === theme.defaults.characters[slot])!;
}

export function resolveLawyer(id: string | null | undefined, theme: ThemeConfig, slot: CharacterPosition) {
  return lawyers.find((entry) => entry.id === id)
    ?? lawyers.find((entry) => entry.id === theme.defaults.lawyers[slot])!;
}

// v2: voice config is part of @quarrel/shared/config too.
export * from "./speech";
