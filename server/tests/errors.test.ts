import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ErrorResponse, RoomResponse, SetReadyRequest } from "@quarrel/shared/contract";
import { AppError, parseRequest, sendParsed } from "../api/errors";
import { buildApp } from "../api/app";
import { createRedis } from "../common/redis";
import { testApp, testSession, workingDb, type TestApp } from "./helpers";

// Needs Redis on localhost:6380 (see helpers.ts).

function testRoutes(app: FastifyInstance): void {
  app.get("/api/test/app-error", async () => {
    throw new AppError("ROOM_FULL");
  });
  app.get("/api/test/app-error-message", async () => {
    throw new AppError("STALE_ROOM", "Custom message.");
  });
  app.get("/api/test/crash", async () => {
    throw new Error("database password is hunter2");
  });
  app.post("/api/test/ready", async (request, reply) => {
    const body = parseRequest(SetReadyRequest, request.body);
    return sendParsed(reply, RoomResponse, { room: null }, body.ready ? 200 : 201);
  });
  app.get("/api/test/bad-response", async (_request, reply) =>
    // A server bug: an extra field that the strict schema rejects.
    sendParsed(reply, RoomResponse, { room: null, playerId: "p_secret" } as never),
  );
}

let t: TestApp | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

async function app(): Promise<FastifyInstance> {
  t = await testApp({ setup: testRoutes });
  return t.app;
}

describe("error handling", () => {
  it("turns an AppError into its status and an ErrorResponse", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/test/app-error" });
    expect(response.statusCode).toBe(409);
    expect(ErrorResponse.parse(response.json())).toEqual({
      error: { code: "ROOM_FULL", message: "This room is full." },
    });
    const custom = await server.inject({ method: "GET", url: "/api/test/app-error-message" });
    expect(custom.json()).toEqual({ error: { code: "STALE_ROOM", message: "Custom message." } });
  });

  it("answers 500 INTERNAL for an unexpected error, leaking nothing", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/test/crash" });
    expect(response.statusCode).toBe(500);
    expect(ErrorResponse.parse(response.json()).error.code).toBe("INTERNAL");
    expect(response.body).not.toContain("hunter2");
    expect(response.body).not.toContain("stack");
    expect(response.body).not.toContain(".ts");
  });

  it("answers 400 INVALID_REQUEST for an invalid body", async () => {
    const server = await app();
    for (const payload of [{ ready: null }, {}, { ready: "true" }]) {
      const response = await server.inject({ method: "POST", url: "/api/test/ready", payload });
      expect(response.statusCode).toBe(400);
      const body = ErrorResponse.parse(response.json());
      expect(body.error.code).toBe("INVALID_REQUEST");
      expect(body.error.message).toContain("ready");
    }
    const ok = await server.inject({ method: "POST", url: "/api/test/ready", payload: { ready: true } });
    expect(ok.statusCode).toBe(200);
  });

  it("answers 400 INVALID_REQUEST for malformed JSON", async () => {
    const server = await app();
    const response = await server.inject({
      method: "POST",
      url: "/api/test/ready",
      headers: { "content-type": "application/json" },
      payload: "{ not json",
    });
    expect(response.statusCode).toBe(400);
    expect(ErrorResponse.parse(response.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("answers 404 NOT_FOUND with an ErrorResponse for an unknown route", async () => {
    const server = await app();
    for (const url of ["/api/nope", "/api/session/nope"]) {
      const response = await server.inject({ method: "GET", url });
      expect(response.statusCode).toBe(404);
      expect(ErrorResponse.parse(response.json()).error.code).toBe("NOT_FOUND");
    }
  });

  it("answers 500 when a response fails its own schema (sendParsed)", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/test/bad-response" });
    expect(response.statusCode).toBe(500);
    expect(ErrorResponse.parse(response.json()).error.code).toBe("INTERNAL");
    expect(response.body).not.toContain("p_secret");
  });
});

describe("Redis outage", () => {
  it("answers 503 SERVICE_UNAVAILABLE when Redis can't be reached", async () => {
    // Nothing listens on this port: the fail-fast client rejects commands immediately.
    const redis = createRedis("redis://127.0.0.1:6390");
    const server = buildApp({ redis, db: workingDb, session: testSession() }, { logger: false });
    server.get("/api/test/crash", async () => {
      throw new Error("not a Redis problem");
    });
    try {
      const wellFormedToken = "A".repeat(43);
      for (const url of ["/api/session/refresh", "/api/session/logout"]) {
        const response = await server.inject({ method: "POST", url, cookies: { quarrel_refresh: wellFormedToken } });
        expect(response.statusCode).toBe(503);
        expect(ErrorResponse.parse(response.json()).error).toEqual({
          code: "SERVICE_UNAVAILABLE",
          message: "The service is temporarily unavailable.",
        });
      }
      const crash = await server.inject({ method: "GET", url: "/api/test/crash" });
      expect(crash.statusCode).toBe(500); // other errors stay 500
    } finally {
      await server.close();
      redis.disconnect();
    }
  });
});
