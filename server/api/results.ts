import type { FastifyInstance } from "fastify";
import { ResultParams, ResultsQuery, ResultResponse, ResultsResponse } from "@quarrel/shared/contract";
import { requireSession } from "./session";
import { parseRequest, sendParsed } from "./errors";
import type { ResultsService } from "../results/results-service";

export function registerResultRoutes(app: FastifyInstance, results: ResultsService) {
  app.get("/api/results", async (request, reply) => {
    const playerId = requireSession(request), query = parseRequest(ResultsQuery, request.query);
    return sendParsed(reply, ResultsResponse, await results.list(playerId, query.roomId));
  });
  app.get("/api/results/:debateId", async (request, reply) => {
    const playerId = requireSession(request), { debateId } = parseRequest(ResultParams, request.params);
    return sendParsed(reply, ResultResponse, await results.get(playerId, debateId));
  });
  app.post("/api/results/:debateId/ack", async (request, reply) => {
    const playerId = requireSession(request), { debateId } = parseRequest(ResultParams, request.params);
    return sendParsed(reply, ResultResponse, await results.acknowledge(playerId, debateId));
  });
}
