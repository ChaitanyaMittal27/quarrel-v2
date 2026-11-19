import { z } from "zod";
import { Slot } from "./common";

// Rule 3.5: the same outcome-language tripwire as the ported planner policy.
const outcome = /\b(?:player|side|team)\s*[ab]\s+(?:wins?|won|is\s+(?:the\s+)?winner|has\s+won)\b|\b(?:winner\s+is|declare\s+(?:a\s+)?winner|final\s+verdict\s*:)\b|\b(?:score|points?)\s*[:=]\s*\d/i;
const safeText = (max: number) => z.string().refine((value) =>
  // eslint-disable-next-line no-control-regex -- Rule 3.5 intentionally rejects unsafe controls.
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) && !outcome.test(value), "Unsafe plan text")
  .trim().refine((value) => [...value].length >= 1 && [...value].length <= max, `Text must be 1-${max} characters`);

export const PlannedSubtopic = z.strictObject({
  ordinal: z.int().min(1).max(5), question: safeText(200), secondsPerPlayer: z.int().min(30).max(600),
});
export type PlannedSubtopic = z.infer<typeof PlannedSubtopic>;

function sequence(plan: { subtopics: PlannedSubtopic[] }, ctx: z.RefinementCtx) {
  const questions = new Set<string>();
  for (const [index, item] of plan.subtopics.entries()) {
    const question = item.question.toLowerCase();
    if (item.ordinal !== index + 1 || questions.has(question)) {
      ctx.addIssue({ code: "custom", path: ["subtopics", index], message: "Use contiguous ordinals and distinct questions" });
    }
    questions.add(question);
  }
}

/** Untrusted AI result. Openers and source are always assigned by the worker. */
export const PlanOutput = z.strictObject({
  text: safeText(900), subtopics: z.array(PlannedSubtopic).min(2).max(5),
}).superRefine(sequence);
export type PlanOutput = z.infer<typeof PlanOutput>;

export const DebatePlan = z.strictObject({
  source: z.enum(["ai", "demo", "fallback"]), text: safeText(900),
  subtopics: z.array(PlannedSubtopic.extend({ openerSlot: Slot })).min(2).max(5),
}).superRefine((plan, ctx) => {
  sequence(plan, ctx);
  plan.subtopics.forEach((item, index) => {
    if (item.openerSlot !== (index % 2 === 0 ? "A" : "B")) {
      ctx.addIssue({ code: "custom", path: ["subtopics", index, "openerSlot"], message: "Openers must alternate A then B" });
    }
  });
});
export type DebatePlan = z.infer<typeof DebatePlan>;
