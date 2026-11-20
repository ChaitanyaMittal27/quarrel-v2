import { z } from "zod";

/** A seat in a room: A is the creator (host), B the joiner. Rule 1.7. */
export const DebateId = z.string().regex(/^d_[A-Za-z0-9_-]{22}$/);
export type DebateId = z.infer<typeof DebateId>;

export const Slot = z.enum(["A", "B"]);
export type Slot = z.infer<typeof Slot>;

/** ISO 8601 timestamp in UTC, e.g. "2026-11-12T18:30:00.000Z" (offsets are rejected). */
export const IsoDateTime = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/**
 * Every error code the API can return. Each one has a fixed HTTP status in ERROR_STATUS.
 * Rules: 1.1 (UNAUTHENTICATED, SESSION_EXPIRED), 1.3 (ROOM_EXPIRED), 1.7/1.9 (ROOM_FULL),
 * 1.8 (INVALID_CODE, ALREADY_IN_ROOM), 1.10 (INVALID_NAME), 1.15 (ROOM_CLOSED),
 * 1.16 (STALE_ROOM), 1.17 (ROOM_NOT_FOUND). NOT_FOUND is an unknown route (not a room).
 */
export const ErrorCode = z.enum([
  "SUMMARIES_NOT_READY", "JURY_NOT_READY", "JURY_RETRY_COOLDOWN",
  "RESULTS_NOT_FOUND", "RESULTS_NOT_READY", "STALE_DEBATE",
  "LAWYER_BUSY",
  "INVALID_CHOICE",
  "REQUEST_CONFLICT",
  "DEBATE_COMPLETE",
  "DEBATE_NOT_STARTED",
  "STALE_TURN",
  "NOT_YOUR_TURN",
  "TURN_EXPIRED",
  "LIMIT_REACHED",
  "INVALID_REQUEST",
  "INVALID_NAME",
  "INVALID_CODE",
  "INVALID_TOPIC",
  "INVALID_POSITION",
  "WRONG_PHASE",
  "POSITION_REQUIRED",
  "FORBIDDEN",
  "PLAN_NOT_READY",
  "PLAYER_NOT_CONNECTED",
  "UNAUTHENTICATED",
  "SESSION_EXPIRED",
  "NOT_FOUND",
  "ROOM_NOT_FOUND",
  "ROOM_EXPIRED",
  "STALE_ROOM",
  "ALREADY_IN_ROOM",
  "ROOM_CLOSED",
  "ROOM_FULL",
  "INTERNAL",
  "SERVICE_UNAVAILABLE",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** HTTP status for each error code. Frozen so nothing can change it at runtime. */
export const ERROR_STATUS = Object.freeze({
  SUMMARIES_NOT_READY: 409, JURY_NOT_READY: 409, JURY_RETRY_COOLDOWN: 429,
  RESULTS_NOT_FOUND: 404, RESULTS_NOT_READY: 409, STALE_DEBATE: 409,
  LAWYER_BUSY: 409,
  INVALID_CHOICE: 400,
  REQUEST_CONFLICT: 409,
  DEBATE_COMPLETE: 409,
  DEBATE_NOT_STARTED: 409,
  STALE_TURN: 409,
  NOT_YOUR_TURN: 409,
  TURN_EXPIRED: 409,
  LIMIT_REACHED: 429,
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
} as const satisfies Record<ErrorCode, number>);

/** Body of every error response. Strict: unknown keys are rejected. */
export const ErrorResponse = z.strictObject({
  error: z.strictObject({
    code: ErrorCode,
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
