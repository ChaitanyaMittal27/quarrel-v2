import { describe, expect, it } from "vitest";
import { ArgumentText, SubmitMessageRequest, DebateMessage, DebateState } from "../contract";

describe("Slice 4 contract", () => {
  it("rule 4.11: preserves raw text, accepts tab/LF and counts Unicode code points", () => {
    for (const text of ["  text  ", "hello\n\tworld", "😀".repeat(600), "x"]) expect(ArgumentText.parse(text)).toBe(text);
    for (const text of ["", " \t\n", "😀".repeat(601), "bad\rtext", "bad\u0000text", "bad\u007ftext", "bad\u009ftext"]) {
      expect(ArgumentText.safeParse(text).success).toBe(false);
    }
  });
  it("rule 4.8,4.11: requires UUIDv4 and the client's current ordinal, ignores untrusted extra input", () => {
    const request = { ordinal: 1, text: "Hi", requestKey: "00000000-0000-4000-8000-000000000000" };
    expect(SubmitMessageRequest.parse({ ...request, now: 999999, slot: "B" })).toEqual(request);
    for (const key of ["", "00000000-0000-1000-8000-000000000000", "00000000-0000-4000-0000-000000000000"]) {
      expect(SubmitMessageRequest.safeParse({ ...request, requestKey: key }).success).toBe(false);
    }
    for (const ordinal of [0, 6, 1.5, "1", null]) expect(SubmitMessageRequest.safeParse({ ...request, ordinal }).success).toBe(false);
    expect(SubmitMessageRequest.safeParse({ text: "Hi", requestKey: request.requestKey }).success).toBe(false);
  });
  it("rule 4.1-4.2: public clock/message objects are strict, with nonnegative clocks and ISO timestamps", () => {
    const debate = { ordinal: 1, activeSlot: "A", clocks: { A: 60000, B: 60000 }, deadline: "2030-01-01T00:00:00Z", yourArgumentsThisSubtopic: 0 };
    expect(DebateState.parse(debate)).toEqual(debate);
    expect(DebateState.safeParse({ ...debate, clocks: { A: -1, B: 0 } }).success).toBe(false);
    expect(DebateState.safeParse({ ...debate, yourArgumentsThisSubtopic: 13 }).success).toBe(false);
    expect(DebateState.safeParse({ ...debate, playerId: "private" }).success).toBe(false);
    const message = { id: "m_1", ordinal: 1, kind: "announcement", slot: null, text: "Subtopic 1: Question?", at: "2030-01-01T00:00:00Z" };
    expect(DebateMessage.parse(message)).toEqual(message);
    expect(DebateMessage.parse({ ...message, kind: "argument", slot: "A" }).slot).toBe("A");
    expect(DebateMessage.safeParse({ ...message, at: 123 }).success).toBe(false);
    expect(DebateMessage.safeParse({ ...message, requestKey: "private" }).success).toBe(false);
  });
});
