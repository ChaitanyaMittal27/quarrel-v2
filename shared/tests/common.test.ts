import { describe, expect, it } from "vitest";
import { ERROR_STATUS, ErrorCode, ErrorResponse, IsoDateTime, Slot } from "../contract";

describe("Slot", () => {
  it("accepts A and B only", () => {
    expect(Slot.parse("A")).toBe("A");
    expect(Slot.parse("B")).toBe("B");
    expect(Slot.safeParse("C").success).toBe(false);
  });
});

describe("IsoDateTime", () => {
  it("accepts UTC timestamps, with or without milliseconds", () => {
    expect(IsoDateTime.safeParse("2026-11-12T18:30:00Z").success).toBe(true);
    expect(IsoDateTime.safeParse(new Date(0).toISOString()).success).toBe(true);
  });

  it("rejects offsets, dates without times and garbage", () => {
    expect(IsoDateTime.safeParse("2026-11-12T18:30:00+01:00").success).toBe(false);
    expect(IsoDateTime.safeParse("2026-11-12").success).toBe(false);
    expect(IsoDateTime.safeParse("yesterday").success).toBe(false);
  });
});

describe("ErrorCode / ERROR_STATUS", () => {
  const expected = {
    ROOM_RATE_LIMITED: 429, JURY_QUOTA_EXHAUSTED: 409,
    SUMMARIES_NOT_READY: 409, JURY_NOT_READY: 409, JURY_RETRY_COOLDOWN: 429,
    RESULTS_NOT_FOUND: 404, RESULTS_NOT_READY: 409, STALE_DEBATE: 409,
    SPEECH_NOT_FOUND: 404, SPEECH_BLOCKED: 422, SPEECH_INVALID_TEXT: 400, SPEECH_UNAVAILABLE: 503, SPEECH_RATE_LIMITED: 429, SPEECH_BUSY: 503, SPEECH_TIMEOUT: 504, SPEECH_PROVIDER_ERROR: 502,
    LAWYER_BUSY: 409,
    INVALID_CHOICE: 400,
    REQUEST_CONFLICT: 409, DEBATE_COMPLETE: 409, DEBATE_NOT_STARTED: 409, STALE_TURN: 409,
    NOT_YOUR_TURN: 409, TURN_EXPIRED: 409, LIMIT_REACHED: 429,
    INVALID_REQUEST: 400,
    INVALID_NAME: 400,
    INVALID_CODE: 400,
    INVALID_TOPIC: 400,
    INVALID_POSITION: 400,
    WRONG_PHASE: 409,
    POSITION_REQUIRED: 409,
    FORBIDDEN: 403,
    PLAN_NOT_READY: 409,
    PLAYER_NOT_CONNECTED: 409,
    UNAUTHENTICATED: 401,
    SESSION_EXPIRED: 401,
    NOT_FOUND: 404,
    ROOM_NOT_FOUND: 404,
    ROOM_EXPIRED: 410,
    STALE_ROOM: 409,
    ALREADY_IN_ROOM: 409,
    ROOM_CLOSED: 409,
    ROOM_FULL: 409,
    INTERNAL: 500,
    SERVICE_UNAVAILABLE: 503,
  };

  it("has exactly the agreed codes", () => {
    expect([...ErrorCode.options].sort()).toEqual(Object.keys(expected).sort());
  });

  it("gives every code a status", () => {
    for (const code of ErrorCode.options) {
      expect(ERROR_STATUS[code]).toBeTypeOf("number");
    }
  });

  it("matches the status table", () => {
    expect(ERROR_STATUS).toEqual(expected);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(ERROR_STATUS)).toBe(true);
  });
});

describe("ErrorResponse", () => {
  it("accepts a valid error", () => {
    const value = { error: { code: "ROOM_FULL", message: "This room is full." } };
    expect(ErrorResponse.parse(value)).toEqual(value);
  });

  it("rejects an unknown code", () => {
    const value = { error: { code: "NOPE", message: "x" } };
    expect(ErrorResponse.safeParse(value).success).toBe(false);
  });

  it("rejects extra keys (strict)", () => {
    expect(
      ErrorResponse.safeParse({ error: { code: "INTERNAL", message: "x", stack: "..." } }).success,
    ).toBe(false);
    expect(
      ErrorResponse.safeParse({ error: { code: "INTERNAL", message: "x" }, extra: 1 }).success,
    ).toBe(false);
  });
});
