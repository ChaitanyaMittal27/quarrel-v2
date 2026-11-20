import { describe, expect, it } from "vitest";
import { JuryFailureCode, JuryVerdict, PublicSummary, SummaryState, JuryState } from "../contract";

const summary = { ordinal: 1, text: "A offered reasons. B offered different reasons.", source: "demo", at: "2030-01-01T00:00:00.000Z" };
const verdict = { source: "demo", text: "Demo verdict, not a real judgment", decision: "inconclusive", outcome: "split", topic: "Topic", positionA: "A", positionB: "B",
  reasoning: "No judgment is made.", strongestArguments: { A: "Not assessed.", B: "Not assessed." }, weaknesses: { A: [], B: [] },
  perSubtopic: [{ ordinal: 1, text: summary.text }, { ordinal: 2, text: summary.text }], compromise: null, subtopicSummaries: [summary, { ...summary, ordinal: 2 }] };
describe("Stage 7 strict public contract", () => {
  it("rules 6.8,6.9: summaries have strict bounded public fields including code-point character limits", () => {
    expect(PublicSummary.safeParse(summary).success).toBe(true);
    expect(PublicSummary.safeParse({ ...summary, text: "😀".repeat(700) }).success).toBe(true);
    for (const value of [{ ...summary, text: "a".repeat(701) }, { ...summary, text: "" }, { ...summary, rawText: "private" }, { ...summary, source: "secret" }]) expect(PublicSummary.safeParse(value).success).toBe(false);
    expect(SummaryState.safeParse({ ordinal: 1, current: summary, showUntil: summary.at }).success).toBe(true);
    expect(SummaryState.safeParse({ ordinal: 1, current: null, showUntil: null }).success).toBe(true);
  });
  it("rules 6.6,6.14,6.17: jury states and verdicts reject missing fields, extras and provider details", () => {
    expect(JuryVerdict.parse(verdict)).toEqual(verdict);
    for (const source of ["ai", "safety"]) expect(JuryVerdict.safeParse({ ...verdict, source }).success).toBe(true);
    for (const key of Object.keys(verdict)) expect(JuryVerdict.safeParse(Object.fromEntries(Object.entries(verdict).filter(([k]) => k !== key))).success).toBe(false);
    expect(JuryVerdict.safeParse({ ...verdict, providerText: "secret" }).success).toBe(false);
    expect(JuryState.safeParse({ status: "pending", errorCode: null, retryAvailableAt: null }).success).toBe(true);
    for (const errorCode of JuryFailureCode.options) expect(JuryState.safeParse({ status: "retry_required", errorCode, retryAvailableAt: summary.at }).success).toBe(true);
    expect(JuryState.safeParse({ status: "retry_required", errorCode: "provider secret", retryAvailableAt: null }).success).toBe(false);
  });
});
