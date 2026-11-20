import { z } from "zod";
import { ErrorCode, Slot } from "./common";
import { Voice } from "../config/voices";

export const SpeechId = z.string().regex(/^d_[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{1,80}$/);
export const SpeechRequest = z.strictObject({ speechId: SpeechId });
export const SpeechItem = z.strictObject({ speechId: SpeechId, text: z.string().min(1),
  kind: z.enum(["argument", "announcement", "summary", "verdict"]), slot: Slot.nullable(),
  voice: Voice, speechBlocked: z.boolean() });
export type SpeechItem = z.infer<typeof SpeechItem>;
export const SpeechErrorResponse = z.strictObject({ error: z.strictObject({ code: ErrorCode, message: z.string() }), fallbackAllowed: z.boolean() });
export type SpeechErrorResponse = z.infer<typeof SpeechErrorResponse>;

/** Local browser preferences, shared so UI validation needs no extra dependency. */
export const AudioPreferences = z.strictObject({ enabled:z.boolean(), muted:z.boolean(), autoplay:z.boolean(),
  volume:z.number().min(0).max(1), speed:z.number().min(0.5).max(2), browserFallback:z.boolean() });
export type AudioPreferences = z.infer<typeof AudioPreferences>;
