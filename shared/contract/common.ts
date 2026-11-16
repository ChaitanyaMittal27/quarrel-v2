import { z } from "zod";

/** A seat in a room: A is the creator (host), B the joiner. Rule 1.7. */
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
  "INVALID_REQUEST",
  "INVALID_NAME",
  "INVALID_CODE",
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
  INVALID_REQUEST: 400,
  INVALID_NAME: 400,
  INVALID_CODE: 400,
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
