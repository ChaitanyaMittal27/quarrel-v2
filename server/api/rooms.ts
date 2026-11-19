import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import {
  CreateRoomRequest, JoinRoomRequest, RoomParams, SetReadyRequest, SetPositionRequest, RoomResponse, LeaveRoomResponse,
} from "@quarrel/shared/contract";
import { AppError, parseRequest, sendParsed } from "./errors";
import type { RoomService } from "../rooms/room-service";

/** Field errors are stable codes; malformed objects and other fields stay generic. */
function parseRoomRequest<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    // Rule 1.8: malformed code wins when both name and code are invalid.
    if (result.error.issues.some((issue) => issue.path[0] === "code")) throw new AppError("INVALID_CODE");
    if (result.error.issues.some((issue) => issue.path[0] === "name")) throw new AppError("INVALID_NAME");
    if (result.error.issues.some((issue) => issue.path[0] === "topic")) throw new AppError("INVALID_TOPIC");
    if (result.error.issues.some((issue) => issue.path[0] === "text")) throw new AppError("INVALID_POSITION");
  }
  return parseRequest(schema, body);
}

export function registerRoomRoutes(app: FastifyInstance, rooms: RoomService): void {
  app.post("/api/rooms", async (request, reply) => {
    const body = parseRoomRequest(CreateRoomRequest, request.body);
    return sendParsed(reply, RoomResponse, await rooms.create(request, reply, body));
  });
  app.post("/api/rooms/join", async (request, reply) => {
    const body = parseRoomRequest(JoinRoomRequest, request.body);
    return sendParsed(reply, RoomResponse, await rooms.join(request, reply, body.code, body.name));
  });
  app.post("/api/rooms/:roomId/leave", async (request, reply) => {
    const { roomId } = parseRequest(RoomParams, request.params);
    return sendParsed(reply, LeaveRoomResponse, await rooms.leave(request, roomId));
  });
  app.put("/api/rooms/:roomId/ready", async (request, reply) => {
    const { roomId } = parseRequest(RoomParams, request.params);
    const { ready } = parseRequest(SetReadyRequest, request.body);
    return sendParsed(reply, RoomResponse, await rooms.setReady(request, roomId, ready));
  });
  app.put("/api/rooms/:roomId/position", async (request, reply) => {
    const { roomId } = parseRequest(RoomParams, request.params);
    const { text } = parseRoomRequest(SetPositionRequest, request.body);
    return sendParsed(reply, RoomResponse, await rooms.setPosition(request, roomId, text));
  });
}
