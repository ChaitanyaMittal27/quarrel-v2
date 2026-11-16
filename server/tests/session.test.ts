import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ErrorResponse } from "@quarrel/shared/contract";
import { hashRefreshToken, secretKey, signAccessToken } from "../common/tokens";
import { ensureSession, requireSession } from "../api/session";
import {
  cookiesOf,
  isCleared,
  TEST_PREVIOUS_SECRET,
  TEST_SECRET,
  testApp,
  type TestApp,
} from "./helpers";

// Needs Redis on localhost:6380 (see helpers.ts).

const THIRTY_DAYS = 30 * 24 * 60 * 60;
const playerId = "p_AAAAAAAAAAAAAAAAAAAAAA";

/** Test-only routes: production has no route that creates a session until 1C. */
function testRoutes(app: FastifyInstance): void {
  app.post("/api/test/ensure", async (request, reply) => ({ playerId: await ensureSession(request, reply) }));
  app.get("/api/test/require", async (request) => ({ playerId: requireSession(request) }));
}

let t: TestApp | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

async function start(session: Parameters<typeof testApp>[0] = {}): Promise<TestApp> {
  t = await testApp({ setup: testRoutes, ...session });
  return t;
}

/** Creates a session and returns its cookie values and player ID. */
async function newSession(app: FastifyInstance) {
  const response = await app.inject({ method: "POST", url: "/api/test/ensure" });
  const cookies = cookiesOf(response);
  return {
    playerId: response.json().playerId as string,
    access: cookies.quarrel_access!.value,
    refresh: cookies.quarrel_refresh!.value,
  };
}

const refresh = (app: FastifyInstance, token?: string) =>
  app.inject({
    method: "POST",
    url: "/api/session/refresh",
    cookies: token === undefined ? {} : { quarrel_refresh: token },
  });

const expectError = (response: { statusCode: number; json: () => unknown }, status: number, code: string) => {
  expect(response.statusCode).toBe(status);
  expect(ErrorResponse.parse(response.json()).error.code).toBe(code);
};

describe("GET /api/session", () => {
  it("answers { room: null } with no cookie, and sets no cookie", async () => {
    const { app } = await start();
    const response = await app.inject({ method: "GET", url: "/api/session" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ room: null });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("answers 200 with a valid access cookie", async () => {
    const { app } = await start();
    const token = await signAccessToken(playerId, secretKey(TEST_SECRET));
    const response = await app.inject({ method: "GET", url: "/api/session", cookies: { quarrel_access: token } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ room: null });
  });

  it("accepts a token signed with SESSION_SECRET_PREVIOUS when configured", async () => {
    const { app } = await start({ session: { previousSecret: TEST_PREVIOUS_SECRET } });
    const token = await signAccessToken(playerId, secretKey(TEST_PREVIOUS_SECRET));
    const response = await app.inject({ method: "GET", url: "/api/test/require", cookies: { quarrel_access: token } });
    expect(response.json()).toEqual({ playerId });
  });

  it("answers 401 SESSION_EXPIRED with an expired access cookie", async () => {
    const { app } = await start();
    const token = await signAccessToken(playerId, secretKey(TEST_SECRET), new Date(Date.now() - 16 * 60_000));
    const response = await app.inject({ method: "GET", url: "/api/session", cookies: { quarrel_access: token } });
    expectError(response, 401, "SESSION_EXPIRED");
  });

  it("answers { room: null } with a tampered cookie, and clears it", async () => {
    const { app } = await start();
    const token = await signAccessToken(playerId, secretKey(TEST_SECRET));
    const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    const response = await app.inject({ method: "GET", url: "/api/session", cookies: { quarrel_access: tampered } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ room: null });
    const access = cookiesOf(response).quarrel_access;
    expect(isCleared(access)).toBe(true);
    expect(access?.path).toBe("/");
  });
});

describe("requireSession", () => {
  it("answers UNAUTHENTICATED without a session and SESSION_EXPIRED with an expired one", async () => {
    const { app } = await start();
    expectError(await app.inject({ method: "GET", url: "/api/test/require" }), 401, "UNAUTHENTICATED");
    const stale = await signAccessToken(playerId, secretKey(TEST_SECRET), new Date(Date.now() - 16 * 60_000));
    expectError(
      await app.inject({ method: "GET", url: "/api/test/require", cookies: { quarrel_access: stale } }),
      401,
      "SESSION_EXPIRED",
    );
  });
});

describe("ensureSession", () => {
  it("creates both cookies with the right attributes", async () => {
    const { app } = await start();
    const response = await app.inject({ method: "POST", url: "/api/test/ensure" });
    expect(response.statusCode).toBe(200);
    expect(response.json().playerId).toMatch(/^p_[A-Za-z0-9_-]{22}$/);

    const { quarrel_access: access, quarrel_refresh: refreshCookie } = cookiesOf(response);
    expect(access).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/", maxAge: THIRTY_DAYS });
    expect(refreshCookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api/session", maxAge: THIRTY_DAYS });
    expect(access?.secure).toBeFalsy();
    expect(refreshCookie?.secure).toBeFalsy();
  });

  it("adds Secure when COOKIE_SECURE is on", async () => {
    const { app } = await start({ session: { cookieSecure: true } });
    const cookies = cookiesOf(await app.inject({ method: "POST", url: "/api/test/ensure" }));
    expect(cookies.quarrel_access?.secure).toBe(true);
    expect(cookies.quarrel_refresh?.secure).toBe(true);
  });

  it("keeps an existing session: same player, no new cookies", async () => {
    const { app } = await start();
    const first = await newSession(app);
    const again = await app.inject({ method: "POST", url: "/api/test/ensure", cookies: { quarrel_access: first.access } });
    expect(again.json()).toEqual({ playerId: first.playerId });
    expect(again.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses to replace an expired session (the client must refresh)", async () => {
    const { app } = await start();
    const stale = await signAccessToken(playerId, secretKey(TEST_SECRET), new Date(Date.now() - 16 * 60_000));
    const response = await app.inject({ method: "POST", url: "/api/test/ensure", cookies: { quarrel_access: stale } });
    expectError(response, 401, "SESSION_EXPIRED");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});

describe("POST /api/session/refresh", () => {
  it("rotates both cookies and keeps the player", async () => {
    const { app } = await start();
    const session = await newSession(app);
    const response = await refresh(app, session.refresh);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");

    const cookies = cookiesOf(response);
    expect(cookies.quarrel_refresh?.value).not.toBe(session.refresh);
    expect(cookies.quarrel_refresh).toMatchObject({ path: "/api/session", httpOnly: true, maxAge: THIRTY_DAYS });
    expect(cookies.quarrel_access).toMatchObject({ path: "/", httpOnly: true, maxAge: THIRTY_DAYS });

    const who = await app.inject({
      method: "GET",
      url: "/api/test/require",
      cookies: { quarrel_access: cookies.quarrel_access!.value },
    });
    expect(who.json()).toEqual({ playerId: session.playerId });
  });

  it("detects reuse after the grace window and revokes the whole family", async () => {
    // A 50 ms grace window instead of 10 s, so the test only waits a moment.
    const { app, redis } = await start({ session: { refreshGraceMs: 50 } });
    const session = await newSession(app);
    const rotated = await refresh(app, session.refresh);
    const newest = cookiesOf(rotated).quarrel_refresh!.value;
    const { familyId } = JSON.parse((await redis.get(`refresh:${hashRefreshToken(newest)}`))!);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const reuse = await refresh(app, session.refresh);
    expectError(reuse, 401, "UNAUTHENTICATED");
    expect(isCleared(cookiesOf(reuse).quarrel_access)).toBe(true);
    expect(isCleared(cookiesOf(reuse).quarrel_refresh)).toBe(true);

    // The newest token belonged to the same family, so it is dead too.
    expect(await redis.get(`refresh-family:${familyId}`)).toBe("revoked");
    expectError(await refresh(app, newest), 401, "UNAUTHENTICATED");
  });

  it("treats reuse within the grace window as a race: new access cookie only", async () => {
    const { app, redis } = await start();
    const session = await newSession(app);
    const first = await refresh(app, session.refresh);
    const newest = cookiesOf(first).quarrel_refresh!.value;

    const raced = await refresh(app, session.refresh);
    expect(raced.statusCode).toBe(204);
    const cookies = cookiesOf(raced);
    expect(Object.keys(cookies)).toEqual(["quarrel_access"]); // refresh cookie untouched
    expect(isCleared(cookies.quarrel_access)).toBe(false);
    expect(cookies.quarrel_access).toMatchObject({ path: "/", httpOnly: true, maxAge: THIRTY_DAYS });

    const who = await app.inject({
      method: "GET",
      url: "/api/test/require",
      cookies: { quarrel_access: cookies.quarrel_access!.value },
    });
    expect(who.json()).toEqual({ playerId: session.playerId });

    // Nothing was revoked: the newest refresh token still works.
    const { familyId } = JSON.parse((await redis.get(`refresh:${hashRefreshToken(newest)}`))!);
    expect(await redis.exists(`refresh-family:${familyId}`)).toBe(0);
    expect((await refresh(app, newest)).statusCode).toBe(204);
  });

  it("lets a revoked family win over the grace window", async () => {
    const { app } = await start();
    const session = await newSession(app);
    const newest = cookiesOf(await refresh(app, session.refresh)).quarrel_refresh!.value;
    await app.inject({ method: "POST", url: "/api/session/logout", cookies: { quarrel_refresh: newest } });

    // The old token was used moments ago, but its family is now revoked.
    const response = await refresh(app, session.refresh);
    expectError(response, 401, "UNAUTHENTICATED");
    expect(isCleared(cookiesOf(response).quarrel_refresh)).toBe(true);
  });

  it("answers 401 and clears cookies for an unknown token or no cookie", async () => {
    const { app } = await start();
    for (const token of ["A".repeat(43), "junk", undefined]) {
      const response = await refresh(app, token);
      expectError(response, 401, "UNAUTHENTICATED");
      expect(isCleared(cookiesOf(response).quarrel_refresh)).toBe(true);
      expect(cookiesOf(response).quarrel_refresh?.path).toBe("/api/session");
    }
  });

  it("lets two concurrent refreshes with the same token both succeed, rotating only once", async () => {
    const { app, redis } = await start();
    const session = await newSession(app);
    const results = await Promise.all([refresh(app, session.refresh), refresh(app, session.refresh)]);
    expect(results.map((r) => r.statusCode)).toEqual([204, 204]);

    // Exactly one response rotated (sets a refresh cookie); the other only got an access cookie.
    const withRefresh = results.filter((r) => cookiesOf(r).quarrel_refresh !== undefined);
    expect(withRefresh).toHaveLength(1);
    for (const r of results) expect(isCleared(cookiesOf(r).quarrel_access)).toBe(false);

    // The winner's refresh token still works and the family is not revoked.
    const winner = cookiesOf(withRefresh[0]!).quarrel_refresh!.value;
    const { familyId } = JSON.parse((await redis.get(`refresh:${hashRefreshToken(winner)}`))!);
    expect((await refresh(app, winner)).statusCode).toBe(204);
    expect(await redis.exists(`refresh-family:${familyId}`)).toBe(0);
  });
});

describe("POST /api/session/logout", () => {
  it("deletes the token, revokes the family and clears both cookies", async () => {
    const { app, redis } = await start();
    const session = await newSession(app);
    const rotated = cookiesOf(await refresh(app, session.refresh)).quarrel_refresh!.value;
    const record = JSON.parse((await redis.get(`refresh:${hashRefreshToken(rotated)}`))!);

    const response = await app.inject({
      method: "POST",
      url: "/api/session/logout",
      cookies: { quarrel_refresh: rotated },
    });
    expect(response.statusCode).toBe(204);
    expect(isCleared(cookiesOf(response).quarrel_access)).toBe(true);
    expect(isCleared(cookiesOf(response).quarrel_refresh)).toBe(true);

    expect(await redis.exists(`refresh:${hashRefreshToken(rotated)}`)).toBe(0);
    expect(await redis.get(`refresh-family:${record.familyId}`)).toBe("revoked");
    expectError(await refresh(app, rotated), 401, "UNAUTHENTICATED");
  });

  it("answers 204 without cookies or with junk", async () => {
    const { app } = await start();
    expect((await app.inject({ method: "POST", url: "/api/session/logout" })).statusCode).toBe(204);
    const junk = await app.inject({ method: "POST", url: "/api/session/logout", cookies: { quarrel_refresh: "junk" } });
    expect(junk.statusCode).toBe(204);
  });
});

describe("refresh tokens at rest", () => {
  it("stores only hashes: the raw token is never a key or a value", async () => {
    const { app, redis } = await start();
    const session = await newSession(app);
    const rotated = cookiesOf(await refresh(app, session.refresh)).quarrel_refresh!.value;

    for (const token of [session.refresh, rotated]) {
      expect(await redis.exists(`refresh:${hashRefreshToken(token)}`)).toBe(1);
      expect(await redis.exists(`refresh:${token}`)).toBe(0);
    }

    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(cursor, "MATCH", "refresh*", "COUNT", 1000);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== "0");
    const values = await Promise.all(keys.map((key) => redis.get(key)));
    const everything = keys.join("\n") + "\n" + values.join("\n");
    expect(everything).not.toContain(session.refresh);
    expect(everything).not.toContain(rotated);

    const record = JSON.parse((await redis.get(`refresh:${hashRefreshToken(session.refresh)}`))!);
    expect(record).toEqual({
      playerId: session.playerId,
      familyId: expect.stringMatching(/^f_/),
      used: true,
      usedAt: expect.any(Number),
    });
    expect(await redis.ttl(`refresh:${hashRefreshToken(rotated)}`)).toBeGreaterThan(THIRTY_DAYS - 60);
  });
});
