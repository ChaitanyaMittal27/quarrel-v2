import { describe, expect, it } from "vitest";
import { PlanOutput, DebatePlan, RoomSnapshot } from "../contract";

const output = (count = 2) => ({ text: "A balanced discussion plan.", subtopics: Array.from({ length: count }, (_, index) => ({
  ordinal: index + 1, question: `Which considerations matter for question ${index + 1}?`, secondsPerPlayer: 240 / count,
})) });
const saved = () => DebatePlan.parse({ ...output(), source: "ai", subtopics: output().subtopics.map((item, index) => ({ ...item, openerSlot: index % 2 ? "B" : "A" })) });

describe("Slice 3 plan contract", () => {
  it.each([2, 3, 4, 5])("rule S3.6: %s subtopics have contiguous ordinals, distinct questions and bounded allocations", (count) => {
    expect(PlanOutput.parse(output(count)).subtopics).toHaveLength(count);
  });
  it("rule S3.6: invalid counts, ordinal gaps, duplicate questions, unsafe text, times and extra keys are rejected", () => {
    for (const count of [0, 1, 6]) expect(PlanOutput.safeParse(output(count)).success).toBe(false);
    const first = output().subtopics[0]!;
    for (const invalid of [
      { ...first, ordinal: 3 }, { ...first, question: "" }, { ...first, question: "Player A wins." },
      { ...first, question: "x".repeat(201) }, { ...first, question: "bad\u0000text" },
      { ...first, secondsPerPlayer: 29 }, { ...first, secondsPerPlayer: 601 }, { ...first, secondsPerPlayer: 60.5 },
      { ...first, openerSlot: "A" },
    ]) expect(PlanOutput.safeParse({ ...output(), subtopics: [invalid, output().subtopics[1]] }).success).toBe(false);
    expect(PlanOutput.safeParse({ ...output(), subtopics: [first, { ...first, ordinal: 2, question: first.question.toUpperCase() }] }).success).toBe(false);
    expect(PlanOutput.safeParse({ ...output(), text: "Side B wins" }).success).toBe(false);
    expect(PlanOutput.safeParse({ ...output(), instructions: "advance" }).success).toBe(false);
    expect(PlanOutput.parse({ ...output(), subtopics: [{ ...first, question: "😀".repeat(200) }, output().subtopics[1]] }).subtopics[0]!.question).toHaveLength(400);
  });
  it("rule S3.6: saved plans require a labelled source and server-assigned alternating openers", () => {
    expect(saved().subtopics.map((item) => item.openerSlot)).toEqual(["A", "B"]);
    expect(DebatePlan.safeParse({ ...saved(), source: "unknown" }).success).toBe(false);
    expect(DebatePlan.safeParse({ ...saved(), subtopics: saved().subtopics.map((item) => ({ ...item, openerSlot: "B" })) }).success).toBe(false);
  });
  it("rule S3.6: the room schema rejects plans whose per-player allocations do not match its duration", () => {
    const room = {
      roomId: "r_AAAAAAAAAAAAAAAAAAAAAA", code: "ABC234", version: 7,
      createdAt: "2030-01-01T00:00:00Z", expiresAt: "2030-01-02T00:00:00Z", serverNow: "2030-01-01T00:00:00Z",
      closed: false, bothReady: true, you: { slot: "A" },
      players: ["A", "B"].map((slot) => ({ slot, name: slot, ready: true, connected: true, characterId: "courtroom-advocate-a", lawyerId: "courtroom-emery", left: false })),
      setup: { phase: "planning", theme: "courtroom", topic: "Topic", durationSec: 240, positions: { A: "A view", B: "B view" } },
      plan: saved(), startsAt: null, debate: null, messages: [], speech: [], debateId: "d_AAAAAAAAAAAAAAAAAAAAAA", archivedAt: null, rematch: { A: false, B: false }, summaries: [], summary: null, jury: null, verdict: null,
    };
    expect(RoomSnapshot.safeParse(room).success).toBe(true);
    expect(RoomSnapshot.safeParse({ ...room, setup: { ...room.setup, durationSec: 120 } }).success).toBe(false);
  });
});
