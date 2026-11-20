import { z } from "zod";
import { IsoDateTime } from "./common";

const boundedText = (max: number) => z.string().refine((text) => [...text].length <= max, "Text is too long");

export const JuryFailureCode = z.enum(["rate_limited", "quota_exhausted", "provider_unavailable", "timeout", "invalid_response", "missing_configuration", "demo_mode", "unsafe_dispute"]);
export type JuryFailureCode = z.infer<typeof JuryFailureCode>;
export const PublicSummary = z.strictObject({
  ordinal: z.int().min(1).max(5), text: boundedText(700).refine((text) => text.length > 0, "Summary is required"),
  source: z.enum(["ai", "demo", "fallback"]), at: IsoDateTime,
});
export type PublicSummary = z.infer<typeof PublicSummary>;
export const JuryVerdict = z.strictObject({
  source: z.enum(["ai", "demo", "safety"]), text: z.string().min(1).max(2400),
  decision: z.enum(["A", "B", "tie", "inconclusive"]), outcome: z.enum(["A", "B", "split"]),
  topic: z.string(), positionA: z.string(), positionB: z.string(), reasoning: z.string().max(1800),
  strongestArguments: z.strictObject({ A: z.string().max(900), B: z.string().max(900) }),
  weaknesses: z.strictObject({ A: z.array(z.string().max(600)).max(5), B: z.array(z.string().max(600)).max(5) }),
  perSubtopic: z.array(z.strictObject({ ordinal: z.int().min(1).max(5), text: boundedText(700) })).min(2).max(5),
  compromise: z.string().max(600).nullable(), subtopicSummaries: z.array(PublicSummary).min(2).max(5),
});
export type JuryVerdict = z.infer<typeof JuryVerdict>;
export const SummaryState = z.strictObject({ ordinal: z.int().min(1).max(5), current: PublicSummary.nullable(), showUntil: IsoDateTime.nullable() });
export const JuryState = z.strictObject({ status: z.enum(["pending", "retry_required"]), errorCode: JuryFailureCode.nullable(), retryAvailableAt: IsoDateTime.nullable() });
