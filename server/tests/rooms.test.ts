import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ERROR_STATUS, ROOM_CODE_ALPHABET, RoomResponse, type RoomSnapshot } from "@quarrel/shared/contract";
import { newPlayerId, secretKey, signAccessToken } from "../common/tokens";
import { RoomRepo } from "../rooms/room-repo";
import { newRoomCode } from "../rooms/room-service";
import { TEST_SECRET, testApp, type TestApp } from "./helpers";

type Identity = { id: string; cookies: { quarrel_access: string } };
type Response = Awaited<ReturnType<TestApp["app"]["inject"]>>;
let t: TestApp;
const keys = new Set<string>();

afterEach(async () => {
  vi.restoreAllMocks();
  if (t) {
    if (keys.size) await t.redis.del(...keys);
    await t.close();
  }
  keys.clear();
});

async function start(rooms: Parameters<typeof testApp>[0] = {}) {
  t = await testApp(rooms);
  return t;
}

async function identity(): Promise<Identity> {
  const id = newPlayerId();
  keys.add(`player:${id}`);
  keys.add(`presence:${id}`);
  return { id, cookies: { quarrel_access: await signAccessToken(id, secretKey(TEST_SECRET)) } };
}

function track(roomId: string, code: string) {
  keys.add(`room:${roomId}`);
  keys.add(`code:${code}`);
}

function snapshot(response: Response): RoomSnapshot {
  expect(response.statusCode, response.body).toBe(200);
  // Rule 1.17: check raw JSON, not just schema fields. Random room IDs can contain "p_"
  // as a substring, so reject whole player IDs rather than that incidental substring.
  expect(response.body).not.toMatch(/"p_[A-Za-z0-9_-]{22}"/);
  for (const key of keys) {
    if (key.startsWith("player:")) expect(response.body).not.toContain(key.slice("player:".length));
  }
  const room = RoomResponse.parse(response.json()).room!;
  expect(room).not.toBeNull();
  track(room.roomId, room.code);
  return room;
}

function error(response: Response, code: keyof typeof ERROR_STATUS) {
  expect(response.statusCode, response.body).toBe(ERROR_STATUS[code]);
  expect(response.json().error.code).toBe(code);
}

async function create(who: Identity, name = "Ann") {
  return snapshot(await t.app.inject({ method: "POST", url: "/api/rooms", cookies: who.cookies, payload: { name, topic: "Test topic" } }));
}
const join = (who: Identity, code: string, name = "Bo") =>
  t.app.inject({ method: "POST", url: "/api/rooms/join", cookies: who.cookies, payload: { code, name } });
const read = (who: Identity) => t.app.inject({ method: "GET", url: "/api/session", cookies: who.cookies });
const leave = (who: Identity, roomId: string) =>
  t.app.inject({ method: "POST", url: `/api/rooms/${roomId}/leave`, cookies: who.cookies });
const position = (who: Identity, roomId: string, text = "My position") =>
  t.app.inject({ method: "PUT", url: `/api/rooms/${roomId}/position`, cookies: who.cookies, payload: { text } });
const ready = (who: Identity, roomId: string, value: unknown = true) =>
  t.app.inject({ method: "PUT", url: `/api/rooms/${roomId}/ready`, cookies: who.cookies, payload: { ready: value } });

/** Negative lifetime uses Redis TIME to make an expired record without sleeping. */
async function expired(who: Identity) {
  const roomId = `r_${randomBytes(16).toString("base64url")}`;
  const code = newRoomCode();
  track(roomId, code);
  const result = await new RoomRepo(t.redis, { lifetimeMs: -1 }).create(who.id, { name: "Old name", topic: "Test topic", theme: "courtroom", durationSec: 240 }, roomId, code);
  expect(result.status).toBe("OK");
  return { roomId, code };
}

describe("room identity and storage (rules 1.1-1.7)", () => {
  it("rule 1.1: create and join establish sessions; leave/ready require one", async () => {
    await start();
    const response = await t.app.inject({ method: "POST", url: "/api/rooms", payload: { name: "Ann", topic: "Test topic" } });
    const room = snapshot(response);
    const second = await t.app.inject({ method: "POST", url: "/api/rooms/join", payload: { code: room.code, name: "Bo" } });
    snapshot(second);
    for (const result of [response, second]) {
      const access = result.cookies.find((cookie) => cookie.name === "quarrel_access")!;
      const who = JSON.parse(Buffer.from(access.value.split(".")[1]!, "base64url").toString()).sub as string;
      keys.add(`player:${who}`);
      const token = result.cookies.find((cookie) => cookie.name === "quarrel_refresh")!.value;
      const { hashRefreshToken } = await import("../common/tokens");
      const tokenKey = `refresh:${hashRefreshToken(token)}`;
      const record = JSON.parse((await t.redis.get(tokenKey))!);
      keys.add(tokenKey);
      keys.add(`refresh-family:${record.familyId}`);
      expect(result.cookies.length).toBe(2);
    }
    error(await t.app.inject({ method: "POST", url: `/api/rooms/${room.roomId}/leave` }), "UNAUTHENTICATED");
    error(await t.app.inject({ method: "PUT", url: `/api/rooms/${room.roomId}/ready`, payload: { ready: true } }), "UNAUTHENTICATED");
  });

  it("rule 1.2: generated IDs and codes use the required formats and alphabet", async () => {
    await start();
    const room = await create(await identity());
    expect(room.roomId).toMatch(/^r_[A-Za-z0-9_-]{22}$/);
    expect(room.code).toHaveLength(6);
    for (const code of Array.from({ length: 100 }, newRoomCode)) {
      expect([...code].every((symbol) => ROOM_CODE_ALPHABET.includes(symbol))).toBe(true);
    }
  });

  it("rules 1.2-1.3: hashes and code pointers are retained until expiry plus 24h; player has no TTL", async () => {
    await start();
    const who = await identity();
    const room = await create(who);
    const fields = await t.redis.hgetall(`room:${room.roomId}`);
    expect(Number(fields.expiresAt) - Number(fields.createdAt)).toBe(86_400_000);
    expect(room.version).toBe(1);
    expect(await t.redis.get(`code:${room.code}`)).toBe(room.roomId);
    expect(await t.redis.pexpiretime(`room:${room.roomId}`)).toBe(Number(fields.expiresAt) + 86_400_000);
    expect(await t.redis.pexpiretime(`code:${room.code}`)).toBe(Number(fields.expiresAt) + 86_400_000);
    expect(await t.redis.ttl(`player:${who.id}`)).toBe(-1);
    snapshot(await join(await identity(), room.code));
    await position(who, room.roomId);
    await ready(who, room.roomId);
    expect((await t.redis.hgetall(`room:${room.roomId}`)).expiresAt).toBe(fields.expiresAt);
  });

  it("rule 1.3: Redis time, not Node time, determines creation and snapshot time", async () => {
    await start();
    const now = await t.redis.time();
    const before = Number(now[0]) * 1000 + Math.floor(Number(now[1]) / 1000);
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    const room = await create(await identity());
    clock.mockRestore();
    expect(Date.parse(room.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(room.serverNow)).toBeGreaterThanOrEqual(Date.parse(room.createdAt));
  });

  it("rule 1.3: configurable lifetime also rejects create's expired response snapshot", async () => {
    await start({ rooms: { lifetimeMs: -1 } });
    const who = await identity();
    const response = await t.app.inject({ method: "POST", url: "/api/rooms", cookies: who.cookies, payload: { name: "Ann", topic: "Test topic" } });
    const roomId = (await t.redis.get(`player:${who.id}`))!;
    track(roomId, (await t.redis.hget(`room:${roomId}`, "code"))!);
    error(response, "ROOM_EXPIRED");
    expect(await t.redis.exists(`room:${roomId}`)).toBe(1);
  });

  it.each(["read", "join", "leave", "ready"])("rule 1.3: expired room rejects %s without mutation", async (action) => {
    await start();
    const who = await identity();
    const old = await expired(who);
    const before = await t.redis.hgetall(`room:${old.roomId}`);
    const response = action === "read" ? await read(who)
      : action === "join" ? await join(who, old.code)
      : action === "leave" ? await leave(who, old.roomId) : await ready(who, old.roomId);
    error(response, "ROOM_EXPIRED");
    expect(await t.redis.hgetall(`room:${old.roomId}`)).toEqual(before);
    expect(await t.redis.get(`player:${who.id}`)).toBe(old.roomId);
  });

  it("rule 1.4: create retry returns the same seat, name, version and room", async () => {
    await start();
    const who = await identity();
    const room = await create(who);
    const again = await create(who, "Replacement");
    expect(again.roomId).toBe(room.roomId);
    expect(again.version).toBe(room.version);
    expect(again.players[0]!.name).toBe("Ann");
  });

  it.each(["create", "join"])("rule 1.5: expired seat is released on %s, historical room retained", async (action) => {
    await start();
    const who = await identity();
    const old = await expired(who);
    const oldFields = await t.redis.hgetall(`room:${old.roomId}`);
    const target = action === "join" ? await create(await identity()) : null;
    const room = target ? snapshot(await join(who, target.code)) : await create(who);
    expect(room.roomId).not.toBe(old.roomId);
    expect(await t.redis.get(`player:${who.id}`)).toBe(room.roomId);
    expect(await t.redis.hgetall(`room:${old.roomId}`)).toEqual(oldFields);
  });

  it("rule 1.7: A creates, B joins, a third identity is refused", async () => {
    await start();
    const a = await identity(), b = await identity(), c = await identity();
    const room = await create(a);
    expect(room.you.slot).toBe("A");
    const joined = snapshot(await join(b, room.code));
    expect(joined.you.slot).toBe("B");
    expect(joined.players.map((player) => player.slot)).toEqual(["A", "B"]);
    expect(joined.version).toBe(2);
    error(await join(c, room.code), "ROOM_FULL");
  });
});

describe("join precedence (rule 1.8)", () => {
  it("rule 1.8: malformed code precedes name and room checks", async () => {
    await start();
    error(await join(await identity(), "IO0199", "\n"), "INVALID_CODE");
  });
  it("rule 1.8: nonexistent room precedes current membership", async () => {
    await start();
    const who = await identity();
    await create(who);
    error(await join(who, "ZZZZZZ"), "ROOM_NOT_FOUND");
  });
  it("rule 1.8: expiry precedes membership and closure", async () => {
    await start();
    const target = await expired(await identity());
    await t.redis.hset(`room:${target.roomId}`, "closed", "1");
    const who = await identity();
    const current = await create(who);
    error(await join(who, target.code), "ROOM_EXPIRED");
    expect(await t.redis.get(`player:${who.id}`)).toBe(current.roomId);
  });
  it("rule 1.8: already my room precedes closed/full and keeps original name", async () => {
    await start();
    const a = await identity(), b = await identity();
    const room = await create(a);
    snapshot(await join(b, room.code));
    await leave(b, room.roomId);
    const before = snapshot(await read(a));
    const again = snapshot(await join(a, ` ${room.code.toLowerCase()} `, "New name"));
    expect(again.players[0]!.name).toBe("Ann");
    expect(again.version).toBe(before.version);
    expect(again.closed).toBe(true);
  });
  it("rule 1.8: target errors do not release an expired current seat", async () => {
    await start();
    const who = await identity();
    const old = await expired(who);
    error(await join(who, "ZZZZZZ"), "ROOM_NOT_FOUND");
    expect(await t.redis.get(`player:${who.id}`)).toBe(old.roomId);
  });
  it("rule 1.8: expired current seat is released before closure is checked", async () => {
    await start();
    const a = await identity(), who = await identity();
    const target = await create(a);
    await leave(a, target.roomId);
    await expired(who);
    error(await join(who, target.code), "ROOM_CLOSED");
    expect(await t.redis.get(`player:${who.id}`)).toBeNull();
  });
  it("rule 1.8: live current membership precedes closed/full", async () => {
    await start();
    const a = await identity(), b = await identity(), who = await identity();
    const target = await create(a);
    snapshot(await join(b, target.code));
    await create(who);
    error(await join(who, target.code), "ALREADY_IN_ROOM");
    await leave(b, target.roomId);
    error(await join(who, target.code), "ALREADY_IN_ROOM");
  });
  it("rule 1.8: closed precedes full", async () => {
    await start();
    const a = await identity(), b = await identity();
    const target = await create(a);
    snapshot(await join(b, target.code));
    await leave(b, target.roomId);
    error(await join(await identity(), target.code), "ROOM_CLOSED");
  });
});

describe("name validation (rule 1.10)", () => {
  it.each(["", "   ", "a".repeat(33), "Ann\n", "A\u0000B", "A\u0085B", 7, null])(
    "rule 1.10: invalid name %j rejected through both APIs", async (name) => {
      await start();
      const who = await identity();
      const target = await create(await identity());
      error(await t.app.inject({ method: "POST", url: "/api/rooms", cookies: who.cookies, payload: { name, topic: "Test topic" } }), "INVALID_NAME");
      error(await t.app.inject({ method: "POST", url: "/api/rooms/join", cookies: who.cookies, payload: { name, code: target.code } }), "INVALID_NAME");
    });
  it("rule 1.10: trims names and counts Unicode code points on both APIs", async () => {
    await start();
    const a = await identity(), b = await identity();
    const room = await create(a, `  ${"😀".repeat(32)}  `);
    const joined = snapshot(await join(b, room.code, "  Bo  "));
    expect(joined.players.map((player) => player.name)).toEqual(["😀".repeat(32), "Bo"]);
  });
  it("rule 1.10: invalid object shape remains INVALID_REQUEST", async () => {
    await start();
    error(await t.app.inject({ method: "POST", url: "/api/rooms", payload: [] }), "INVALID_REQUEST");
  });
});

describe("readiness, leave and privacy (rules 1.12-1.17)", () => {
  it("rules 1.12-1.13: bothReady requires both seats, readiness and presence", async () => {
    await start();
    const a = await identity(), b = await identity();
    const room = await create(a);
    error(await ready(a, room.roomId), "WRONG_PHASE");
    snapshot(await join(b, room.code));
    await position(a, room.roomId);
    await position(b, room.roomId);
    expect(snapshot(await ready(a, room.roomId)).bothReady).toBe(false);
    expect(snapshot(await ready(b, room.roomId)).bothReady).toBe(false);
    await t.redis.set(`presence:${a.id}`, "1", "EX", 35);
    expect(snapshot(await read(a)).bothReady).toBe(false);
    await t.redis.set(`presence:${b.id}`, "1", "EX", 35);
    expect(snapshot(await read(a)).bothReady).toBe(true);
    await t.redis.del(`presence:${b.id}`);
    expect(snapshot(await read(a)).bothReady).toBe(false);
  });
  it("rule 1.13: readiness changes only your own seat; repeated value is a no-op", async () => {
    await start();
    const a = await identity(), b = await identity();
    const room = await create(a);
    snapshot(await join(b, room.code));
    await position(b, room.roomId);
    const changed = snapshot(await ready(b, room.roomId));
    expect(changed.players.map((player) => player.ready)).toEqual([false, true]);
    expect(changed.version).toBe(4);
    expect(snapshot(await ready(b, room.roomId)).version).toBe(4);
    expect(snapshot(await ready(b, room.roomId, false)).version).toBe(5);
  });
  it.each([null, "true", 1])("rule 1.13: invalid readiness %j rejected", async (value) => {
    await start();
    const a = await identity();
    const room = await create(a);
    error(await ready(a, room.roomId, value), "INVALID_REQUEST");
  });
  it("rule 1.13: missing readiness is rejected", async () => {
    await start();
    const a = await identity();
    const room = await create(a);
    error(await t.app.inject({ method: "PUT", url: `/api/rooms/${room.roomId}/ready`, cookies: a.cookies, payload: {} }), "INVALID_REQUEST");
  });
  it.each(["A", "B"])("rules 1.14-1.15: %s leaves, name stays, remaining player reads closed room", async (slot) => {
    await start();
    const a = await identity(), b = await identity();
    const room = await create(a);
    snapshot(await join(b, room.code));
    const leaver = slot === "A" ? a : b;
    const peer = slot === "A" ? b : a;
    await position(leaver, room.roomId);
    await ready(leaver, room.roomId);
    await t.redis.set(`presence:${leaver.id}`, "1", "EX", 35);
    const response = await leave(leaver, room.roomId);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ room: null });
    expect(await t.redis.get(`player:${leaver.id}`)).toBeNull();
    const remaining = snapshot(await read(peer));
    const seat = remaining.players.find((player) => player.slot === slot)!;
    expect(seat).toMatchObject({ name: slot === "A" ? "Ann" : "Bo", left: true, ready: false, connected: false });
    expect(remaining.closed).toBe(true);
    expect(remaining.bothReady).toBe(false);
    expect(remaining.version).toBe(5);
    expect((await read(leaver)).json()).toEqual({ room: null });
    expect((await leave(leaver, room.roomId)).json()).toEqual({ room: null });
    error(await ready(leaver, room.roomId), "ROOM_NOT_FOUND");
    error(await join(leaver, room.code), "ROOM_CLOSED");
  });
  it("rules 1.14, 1.16: stale/delayed leave and readiness cannot detach or mutate a newer room", async () => {
    await start();
    const a = await identity();
    const old = await create(a);
    await leave(a, old.roomId);
    const current = await create(a);
    error(await leave(a, old.roomId), "STALE_ROOM");
    error(await ready(a, old.roomId), "STALE_ROOM");
    expect(snapshot(await read(a)).roomId).toBe(current.roomId);
    expect(snapshot(await read(a)).version).toBe(1);
  });
  it("rules 1.16-1.17: outsider learns nothing; no-room leave is a no-op", async () => {
    await start();
    const room = await create(await identity());
    const outsider = await identity();
    error(await ready(outsider, room.roomId), "ROOM_NOT_FOUND");
    const missing = `r_${randomBytes(16).toString("base64url")}`;
    error(await ready(outsider, missing), "ROOM_NOT_FOUND");
    for (const id of [room.roomId, missing]) {
      expect((await leave(outsider, id)).json()).toEqual({ room: null });
    }
    expect((await read(outsider)).json()).toEqual({ room: null });
  });
  it("rule 1.17: a session read cleans up a pointer to a missing room", async () => {
    await start();
    const who = await identity();
    const room = await create(who);
    await t.redis.del(`room:${room.roomId}`);
    expect((await read(who)).json()).toEqual({ room: null });
    expect(await t.redis.get(`player:${who.id}`)).toBeNull();
  });
});

describe("room races and code collisions", () => {
  it("race rules 1.7, 1.9: 20 parallel joins yield one success and 19 ROOM_FULL", async () => {
    await start();
    const room = await create(await identity());
    const joiners = await Promise.all(Array.from({ length: 20 }, identity));
    const results = await Promise.all(joiners.map((who) => join(who, room.code)));
    expect(results.filter((response) => response.statusCode === 200)).toHaveLength(1);
    for (const response of results.filter((item) => item.statusCode !== 200)) error(response, "ROOM_FULL");
    expect(snapshot(results.find((response) => response.statusCode === 200)!).players).toHaveLength(2);
    expect((await Promise.all(joiners.map((who) => t.redis.get(`player:${who.id}`)))).filter(Boolean)).toHaveLength(1);
  });
  it("race rules 1.4, 1.6: parallel creates by one identity yield one room", async () => {
    await start();
    const who = await identity();
    const results = await Promise.all(Array.from({ length: 20 }, () => create(who)));
    expect(new Set(results.map((room) => room.roomId)).size).toBe(1);
    expect(results.every((room) => room.version === 1)).toBe(true);
  });
  it("race rule 1.6: create and join by the same identity result in one seat", async () => {
    await start();
    const host = await identity(), who = await identity();
    const target = await create(host);
    const [created, joined] = await Promise.all([
      t.app.inject({ method: "POST", url: "/api/rooms", cookies: who.cookies, payload: { name: "Ann", topic: "Test topic" } }),
      join(who, target.code),
    ]);
    const current = snapshot(created);
    if (joined.statusCode === 200) {
      expect(snapshot(joined).roomId).toBe(target.roomId);
      expect(current.roomId).toBe(target.roomId);
    } else {
      error(joined, "ALREADY_IN_ROOM");
      expect(snapshot(await read(host)).players).toHaveLength(1);
    }
    expect(await t.redis.get(`player:${who.id}`)).toBe(current.roomId);
  });
  it("race rule 1.6: leave and create serialize without detaching a newer seat", async () => {
    await start();
    const who = await identity();
    const old = await create(who);
    const [, response] = await Promise.all([leave(who, old.roomId),
      t.app.inject({ method: "POST", url: "/api/rooms", cookies: who.cookies, payload: { name: "Ann", topic: "Test topic" } })]);
    expect(response.statusCode).toBe(200);
    const result = RoomResponse.parse(response.json());
    if (result.room) track(result.room.roomId, result.room.code);
    const current = await t.redis.get(`player:${who.id}`);
    if (current) {
      expect(current).not.toBe(old.roomId);
      expect(snapshot(await read(who)).roomId).toBe(current);
    } else {
      expect((await read(who)).json()).toEqual({ room: null });
    }
  });
  it("rule 1.2: code collision retries without overwriting the existing room", async () => {
    const generateCode = vi.fn(newRoomCode);
    await start({ rooms: { generateCode } });
    const first = await create(await identity());
    generateCode.mockReturnValueOnce(first.code);
    const second = await create(await identity());
    expect(second.code).not.toBe(first.code);
    expect(await t.redis.get(`code:${first.code}`)).toBe(first.roomId);
    expect(generateCode).toHaveBeenCalledTimes(3);
  });
  it("rule 1.2: five code collisions fail cleanly, without a seat", async () => {
    const generateCode = vi.fn(newRoomCode);
    await start({ rooms: { generateCode } });
    const first = await create(await identity());
    generateCode.mockReturnValue(first.code);
    const who = await identity();
    error(await t.app.inject({ method: "POST", url: "/api/rooms", cookies: who.cookies, payload: { name: "Ann", topic: "Test topic" } }), "SERVICE_UNAVAILABLE");
    expect(await t.redis.get(`player:${who.id}`)).toBeNull();
    expect(generateCode).toHaveBeenCalledTimes(6);
  });

  it("race rules 1.6, 1.17: snapshot rechecks a pointer changed during key discovery", async () => {
    await start();
    const who = await identity();
    const old = await create(who);
    const hgetall = t.redis.hgetall.bind(t.redis);
    const discover = vi.spyOn(t.redis, "hgetall").mockImplementationOnce(async (key) => {
      const fields = await hgetall(key);
      await leave(who, old.roomId);
      await create(who);
      return fields;
    });
    const response = snapshot(await read(who));
    discover.mockRestore();
    expect(response.roomId).not.toBe(old.roomId);
    expect(await t.redis.get(`player:${who.id}`)).toBe(response.roomId);
  });

  it("race rules 1.6, 1.12: snapshot rechecks seats added during presence-key discovery", async () => {
    await start();
    const a = await identity(), b = await identity();
    const room = await create(a);
    // B joining during discovery invalidates the discovered presence keys.
    await t.redis.set(`presence:${a.id}`, "1", "EX", 35);
    await t.redis.set(`presence:${b.id}`, "1", "EX", 35);
    const hgetall = t.redis.hgetall.bind(t.redis);
    vi.spyOn(t.redis, "hgetall").mockImplementationOnce(async (key) => {
      const fields = await hgetall(key);
      snapshot(await join(b, room.code));
      await position(a, room.roomId);
      await position(b, room.roomId);
      await ready(a, room.roomId);
      await ready(b, room.roomId);
      return fields;
    });
    expect(snapshot(await read(a)).bothReady).toBe(true);
  });
});

describe("Lua script cache", () => {
  it("room requests recover after Redis forgets a script", async () => {
    await start();
    const who = await identity();
    const room = await create(who);
    snapshot(await join(await identity(), room.code));
    await position(who, room.roomId);
    // Simulate only this client's cache miss; do not flush scripts used by other test files.
    vi.spyOn(t.redis, "evalsha").mockRejectedValueOnce(new Error("NOSCRIPT No matching script. Please use EVAL."));
    expect(snapshot(await ready(who, room.roomId)).players[0]!.ready).toBe(true);
  });
});

describe("room events", () => {
  it("roomChanged fires once per successful change and never for failures or no-ops", async () => {
    await start();
    const changed = vi.fn();
    t.app.rooms.events.on("roomChanged", changed);
    const a = await identity(), b = await identity();
    const room = await create(a);
    expect(changed).toHaveBeenCalledTimes(1);
    await create(a);
    snapshot(await join(a, room.code));
    expect(changed).toHaveBeenCalledTimes(1);
    snapshot(await join(b, room.code));
    expect(changed).toHaveBeenCalledTimes(2);
    await position(a, room.roomId);
    expect(changed).toHaveBeenCalledTimes(3);
    await ready(a, room.roomId);
    expect(changed).toHaveBeenCalledTimes(4);
    await ready(a, room.roomId);
    error(await join(await identity(), room.code), "ROOM_FULL");
    expect(changed).toHaveBeenCalledTimes(4);
    await leave(a, room.roomId);
    expect(changed).toHaveBeenCalledTimes(5);
    await leave(a, room.roomId);
    error(await ready(a, room.roomId), "ROOM_NOT_FOUND");
    expect(changed).toHaveBeenCalledTimes(5);
    expect(changed.mock.calls.every(([id]) => id === room.roomId)).toBe(true);
  });
});
