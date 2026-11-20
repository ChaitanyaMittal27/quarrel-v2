import type { FastifyInstance } from "fastify";
import { RoomParams, SpeechRequest, SpeechErrorResponse } from "@quarrel/shared/contract";
import { requireSession } from "./session";
import { AppError, errorBody, parseRequest, sendParsed } from "./errors";
import { SpeechFailure, type SpeechService } from "../speech/speech-service";
import { isRedisUnavailable } from "../common/redis";

export function registerSpeechRoutes(app: FastifyInstance, speech: SpeechService) {
  app.post("/api/rooms/:roomId/speech",async (request,reply) => {
    try {
      const playerId=requireSession(request), {roomId}=parseRequest(RoomParams,request.params), {speechId}=parseRequest(SpeechRequest,request.body);
      const audio=await speech.speak(playerId,roomId,speechId);
      return reply.header("Cache-Control","no-store").type("audio/wav").send(audio);
    } catch (error) {
      const failure = error instanceof AppError ? error : new AppError(isRedisUnavailable(error) ? "SERVICE_UNAVAILABLE" : "INTERNAL");
      return sendParsed(reply,SpeechErrorResponse,{...errorBody(failure.code),fallbackAllowed:error instanceof SpeechFailure && error.fallbackAllowed},failure.status);
    }
  });
}
