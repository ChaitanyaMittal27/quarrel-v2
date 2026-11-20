import { getTheme, resolveLawyer } from "./config";
import type { SpeechItem } from "./contract/speech";

// Ported v1 tripwire, not a comprehensive abuse classifier. Both engines honor the flag.
export const speechBlocked = (text: string): boolean => /\b(?:kill|hurt|hit|beat|threaten|coerce|blackmail)\s+(?:me|you|him|her|them|my\s+(?:partner|wife|husband|friend))\b|\b(?:domestic abuse|sexual assault|coercive control)\b/i.test(text);
export interface SpeechPublicInput {
  debateId: string; theme: string; lawyers: { A?: string; B?: string };
  messages: { id: string; kind: string; slot: "A" | "B" | null; text: string }[];
  verdict: { text: string } | null;
}
/** Public allowlist shared by the read-only route and per-player mapper. No private input. */
export function speakableItems(input: SpeechPublicInput): SpeechItem[] {
  const theme = getTheme(input.theme);
  const items: SpeechItem[] = [];
  for (const message of input.messages) {
    const kind = message.kind === "judge_summary" ? "summary" : message.kind;
    if (!["argument", "announcement", "summary"].includes(kind) || !message.text.trim() || kind === "argument" && !message.slot) continue;
    const config = kind === "argument" ? resolveLawyer(input.lawyers[message.slot!], theme, message.slot!) : theme.judge;
    items.push({ speechId: `${input.debateId}:${message.id}`, text: message.text, kind: kind as SpeechItem["kind"], slot: kind === "argument" ? message.slot : null,
      voice: { geminiVoice: config.geminiVoice, browserVoice: config.browserVoice }, speechBlocked: speechBlocked(message.text) });
  }
  if (input.verdict?.text.trim()) items.push({ speechId: `${input.debateId}:verdict`, text: input.verdict.text, kind: "verdict", slot: null,
    voice: { geminiVoice: theme.judge.geminiVoice, browserVoice: theme.judge.browserVoice }, speechBlocked: speechBlocked(input.verdict.text) });
  return items;
}
