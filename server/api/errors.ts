import type { FastifyError, FastifyInstance, FastifyReply } from "fastify";
import type { z } from "zod";
import { ERROR_STATUS, type ErrorCode, type ErrorResponse } from "@quarrel/shared/contract";
import { isRedisUnavailable } from "../common/redis";

/** Default message per code. Messages are for people; clients branch on `code`. */
const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  INVALID_CHOICE: "Choose an existing character or lawyer.",
  REQUEST_CONFLICT: "This request key was already used for different content.",
  DEBATE_COMPLETE: "The debate has ended.",
  DEBATE_NOT_STARTED: "The debate has not started.",
  STALE_TURN: "The subtopic has changed.",
  NOT_YOUR_TURN: "It is not your turn.",
  TURN_EXPIRED: "Your turn has expired.",
  LIMIT_REACHED: "You have reached 12 arguments for this subtopic.",
  INVALID_REQUEST: "The request is invalid.",
  INVALID_NAME: "Names must be 1–32 characters with no control characters.",
  INVALID_CODE: "Room codes are 6 characters.",
  INVALID_TOPIC: "Topics must be 1-240 characters with no control characters.",
  INVALID_POSITION: "Positions must be 1-600 characters; only tab and newline controls are allowed.",
  WRONG_PHASE: "This action is not allowed in the current phase.",
  POSITION_REQUIRED: "Write your position before becoming ready.",
  FORBIDDEN: "Only the host can start the debate.",
  PLAN_NOT_READY: "The debate plan is not ready yet.",
  PLAYER_NOT_CONNECTED: "Both players must be connected to start.",
  UNAUTHENTICATED: "You don't have a session.",
  SESSION_EXPIRED: "Your session has expired. Refresh it and try again.",
  NOT_FOUND: "There is nothing at this address.",
  ROOM_NOT_FOUND: "Room not found.",
  ROOM_EXPIRED: "This room has expired.",
  STALE_ROOM: "You are now in a different room.",
  ALREADY_IN_ROOM: "You are already in another room.",
  ROOM_CLOSED: "This room is closed to new players.",
  ROOM_FULL: "This room is full.",
  INTERNAL: "Something went wrong on our side.",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",
};

/**
 * An error the client is meant to see. Throw it from a route or helper; the error handler
 * turns it into the right status and an ErrorResponse body.
 */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export function errorBody(code: ErrorCode, message?: string): ErrorResponse {
  return { error: { code, message: message ?? DEFAULT_MESSAGES[code] } };
}

/** Sends an error response directly (for code paths that don't throw). */
export function sendError(reply: FastifyReply, code: ErrorCode, message?: string): FastifyReply {
  return reply.code(ERROR_STATUS[code]).send(errorBody(code, message));
}

/**
 * Parses request input (body, params, query) with its contract schema. On failure, throws
 * AppError INVALID_REQUEST listing which fields were wrong (never their values).
 */
export function parseRequest<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(body)";
    return `${path}: ${issue.message}`;
  });
  throw new AppError("INVALID_REQUEST", `Invalid request. ${fields.join("; ")}`);
}

/**
 * Sends a response body after parsing it with its contract schema. Strict schemas reject
 * unknown keys, so nothing extra (like an internal ID) can be sent by mistake. A body that
 * fails is a server bug: it is logged and the client gets 500 INTERNAL instead.
 */
export function sendParsed<S extends z.ZodType>(
  reply: FastifyReply,
  schema: S,
  body: z.input<S>,
  statusCode = 200,
): FastifyReply {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.log.error(
      { issues: result.error.issues, url: reply.request.url },
      "response body does not match its contract schema",
    );
    return sendError(reply, "INTERNAL");
  }
  return reply.code(statusCode).send(result.data);
}

/** Installs the error and not-found handlers on the root app (all routes inherit them). */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      return sendError(reply, error.code, error.message);
    }
    // Errors Fastify raises about the request itself: schema validation, malformed JSON,
    // wrong content type, body too large. All are the client's fault.
    const status = "statusCode" in error ? error.statusCode : undefined;
    if ("validation" in error && error.validation) return sendError(reply, "INVALID_REQUEST");
    if (status !== undefined && status >= 400 && status < 500) {
      return sendError(reply, "INVALID_REQUEST");
    }
    // Redis is down or unreachable: a temporary outage, not a bug.
    if (isRedisUnavailable(error)) {
      request.log.warn({ err: error }, "redis unavailable");
      return sendError(reply, "SERVICE_UNAVAILABLE");
    }
    // Anything else is a bug: log everything, tell the client nothing.
    request.log.error({ err: error }, "unhandled error");
    return sendError(reply, "INTERNAL");
  });

  app.setNotFoundHandler((_request, reply) => sendError(reply, "NOT_FOUND"));
}
