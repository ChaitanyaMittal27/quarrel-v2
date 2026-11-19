import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "socket.io";
import { io as clientIo, type Socket } from "socket.io-client";
import { RoomResponse, type DebatePlan, type ClientToServerEvents, type ServerToClientEvents } from "@quarrel/shared/contract";
import { connectedRedis, testApp, TEST_SECRET, type TestApp } from "./helpers";
import { newPlayerId, secretKey, signAccessToken } from "../common/tokens";
import { RoomRepo } from "../rooms/room-repo";
import { createDeadlineTick, startDeadlineLoop } from "../worker/clock-worker";
import { subscribeRoomEvents, ROOM_EVENTS_CHANNEL } from "../rooms/room-pubsub";
import { registerSockets, type GameServer } from "../api/sockets";

type Player = { id: string; cookies: { quarrel_access: string } };
type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let t: TestApp, repo: RoomRepo, now: number, a: Player, b: Player, roomId: string, startsAt: number;
let deadlinesKey: string;
let stopPoller: (() => Promise<void>) | undefined;
let io: GameServer | undefined, drain: (() => Promise<void>) | undefined, stopSubscriber: (() => Promise<void>) | undefined;
const clients: Client[] = [], cancellations: (() => void)[] = [], keys = new Set<string>();
const plan: DebatePlan = { source: "demo", text: "Two balanced subtopics", subtopics: [
  { ordinal: 1, question: "First question?", secondsPerPlayer: 60, openerSlot: "A" },
  { ordinal: 2, question: "Second question?", secondsPerPlayer: 60, openerSlot: "B" },
] };
beforeEach(async () => {
  const redis = await connectedRedis();
  const time = await redis.time(); redis.disconnect(); now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  deadlinesKey = `deadlines:s4-${randomBytes(8).toString("hex")}`; keys.add(deadlinesKey);
  t = await testApp({ rooms: { now: () => now, deadlinesKey } });
  repo = new RoomRepo(t.redis, { now: () => now, deadlinesKey });
  async function player(): Promise<Player> {
    const id = newPlayerId(); keys.add(`player:${id}`); keys.add(`presence:${id}`);
    return { id, cookies: { quarrel_access: await signAccessToken(id, secretKey(TEST_SECRET)) } };
  }
  a = await player(); b = await player();
  const created = snapshot(await post(a, "/api/rooms", { name: "Ann", topic: "Topic", durationSec: 120 }));
  roomId = created.roomId; keys.add(`room:${roomId}`); keys.add(`code:${created.code}`);
  keys.add(`room:${roomId}:messages`); keys.add(`room:${roomId}:requests`);
  await post(b, "/api/rooms/join", { name: "Bo", code: created.code });
  for (const who of [a, b]) {
    await t.app.inject({ method: "PUT", url: `/api/rooms/${roomId}/position`, cookies: who.cookies, payload: { text: "A position" } });
    await t.app.inject({ method: "PUT", url: `/api/rooms/${roomId}/ready`, cookies: who.cookies, payload: { ready: true } });
    await repo.refreshPresence(who.id);
  }
  await repo.savePlan(roomId, plan);
  startsAt = now + 3000;
});
afterEach(async () => {
  cancellations.splice(0).forEach((cancel) => cancel()); clients.splice(0).forEach((client) => client.disconnect());
  await stopPoller?.(); await stopSubscriber?.(); await io?.close(); await drain?.();
  if (keys.size) await t.redis.del(...keys); keys.clear(); await t.close();
  io = undefined; drain = undefined; stopSubscriber = undefined; stopPoller = undefined;
  vi.restoreAllMocks();
});
const post = (who: Player, url: string, payload?: Record<string, unknown>) => t.app.inject({ method: "POST", url, cookies: who.cookies, ...(payload === undefined ? {} : { payload }) });
const start = () => post(a, `/api/rooms/${roomId}/start`);
const submit = (who = a, ordinal = 1, text = "My argument", requestKey: string = randomUUID()) => post(who, `/api/rooms/${roomId}/messages`, { ordinal, text, requestKey });
function snapshot(response: Awaited<ReturnType<typeof post>>) {
  expect(response.statusCode, response.body).toBe(200); return RoomResponse.parse(response.json()).room!;
}
function error(response: Awaited<ReturnType<typeof post>>, code: string, status = 409) {
  expect(response.statusCode, response.body).toBe(status); expect(response.json().error.code).toBe(code);
}

describe("Slice 4 Lua and HTTP", () => {
  it("rule 4.1-4.2: Start opens subtopic 1, posts its announcement at startsAt and schedules its deadline", async () => {
    const room = snapshot(await start());
    expect(room.debate).toEqual({ ordinal: 1, activeSlot: "A", clocks: { A: 60000, B: 60000 }, deadline: new Date(startsAt + 60000).toISOString(), yourArgumentsThisSubtopic: 0 });
    expect(room.messages).toEqual([{ id: "m_1", ordinal: 1, kind: "announcement", slot: null, text: "Subtopic 1: First question?", at: new Date(startsAt).toISOString() }]);
    expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(startsAt + 60000);
    expect(await t.redis.pttl(`room:${roomId}:messages`)).toBeGreaterThan(172790000);
  });
  it("rule 4.3-4.4: submit preserves raw text, charges only the sender up to now and passes the turn", async () => {
    await start(); now = startsAt + 1500;
    const room = snapshot(await submit(a, 1, "  Exactly\n\tas typed  "));
    expect(room.debate).toMatchObject({ activeSlot: "B", clocks: { A: 58500, B: 60000 }, yourArgumentsThisSubtopic: 1 });
    expect(Date.parse(room.debate!.deadline!) - now).toBe(60000);
    expect(room.messages[1]).toMatchObject({ slot: "A", text: "  Exactly\n\tas typed  ", at: new Date(now).toISOString() });
    expect((await t.app.rooms.current(b.id)).room!.debate!.yourArgumentsThisSubtopic).toBe(0);
    expect(await t.redis.pttl(`room:${roomId}:requests`)).toBeGreaterThan(172790000);
    expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(now + 60000);
  });
  it("rule 4.4: the turn stays with the sender when the opponent is exhausted", async () => {
    await start(); now = startsAt + 60000; await repo.catchup(roomId);
    now += 1500; const room = snapshot(await submit(b));
    expect(room.debate).toMatchObject({ activeSlot: "B", clocks: { A: 0, B: 58500 } });
    expect(Date.parse(room.debate!.deadline!)).toBe(startsAt + 120000);
  });
  it("rule 4.6,4.14: expiry anchors to the old deadline and ignores disconnected presence", async () => {
    await start(); await repo.clearPresence(a.id); await repo.clearPresence(b.id);
    now = startsAt + 65000; const result = await repo.catchup(roomId);
    expect(result).toMatchObject({ changed: true, deadline: startsAt + 120000 });
    expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(startsAt + 120000);
    const room = (await t.app.rooms.current(a.id)).room!;
    expect(room.debate).toMatchObject({ activeSlot: "B", clocks: { A: 0, B: 55000 } });
    expect(room.players.every((seat) => !seat.connected)).toBe(true);
  });
  it("rule 4.7,4.12: a delayed HTTP read catches several transitions, opens B's subtopic, then ends", async () => {
    await start(); now = startsAt + 125000;
    const room = snapshot(await t.app.inject({ url: "/api/session", cookies: a.cookies }));
    expect(room.debate).toMatchObject({ ordinal: 2, activeSlot: "B", clocks: { A: 60000, B: 55000 } });
    expect(room.messages[1]).toMatchObject({ text: "Subtopic 2: Second question?", at: new Date(startsAt + 120000).toISOString() });
    expect(room.version).toBe(10); expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(startsAt + 180000);
    now = startsAt + 999999;
    const ended = (await t.app.rooms.current(b.id)).room!;
    expect(ended.setup.phase).toBe("ended");
    expect(ended.debate).toMatchObject({ ordinal: 2, activeSlot: null, clocks: { A: 0, B: 0 }, deadline: null });
    expect(ended.messages).toHaveLength(2); expect(ended.version).toBe(12);
    expect(await t.redis.zscore(deadlinesKey, roomId)).toBeNull();
    expect(await repo.catchup(roomId)).toMatchObject({ changed: false, deadline: null });
  });
  it("rule 4.8: replay/conflict precede phase, ordinal and turn checks, including after ended", async () => {
    await start(); now = startsAt; const key = randomUUID();
    const first = snapshot(await submit(a, 1, "Same text", key));
    const replay = snapshot(await submit(a, 1, "Same text", key));
    expect(replay.version).toBe(first.version); expect(replay.messages).toEqual(first.messages);
    error(await submit(a, 2, "Same text", key), "REQUEST_CONFLICT");
    error(await submit(a, 1, "Different text", key), "REQUEST_CONFLICT");
    now = startsAt + 999999;
    const after = snapshot(await submit(a, 1, "Same text", key)); expect(after.setup.phase).toBe("ended");
    error(await submit(a, 1, "Different text", key), "REQUEST_CONFLICT");
    error(await submit(a, 1), "DEBATE_COMPLETE");
  });
  it("rule 4.8: not-started precedes ordinal/turn, stale ordinal precedes turn, and exact expiry catches up first", async () => {
    error(await submit(b, 2), "DEBATE_NOT_STARTED");
    await start(); error(await submit(b, 2), "DEBATE_NOT_STARTED");
    now = startsAt;
    error(await submit(b, 2), "STALE_TURN"); error(await submit(b), "NOT_YOUR_TURN");
    now = startsAt + 60000;
    error(await submit(a), "NOT_YOUR_TURN");
    expect((await repo.readRoom(roomId)).activeSlot).toBe("B");
    now = startsAt + 120000;
    error(await submit(a), "STALE_TURN");
    expect((await repo.readRoom(roomId)).ordinal).toBe("2");
  });
  it("rule 4.9-4.10: 12 arguments per player; hitting the cap neither changes nor extends the clock", async () => {
    await start(); now = startsAt;
    for (let index = 0; index < 12; index++) { snapshot(await submit(a)); snapshot(await submit(b)); }
    const before = await repo.readRoom(roomId); const messages = await t.redis.lrange(`room:${roomId}:messages`, 0, -1);
    error(await submit(a), "LIMIT_REACHED", 429);
    expect(await repo.readRoom(roomId)).toEqual(before);
    expect(await t.redis.lrange(`room:${roomId}:messages`, 0, -1)).toEqual(messages);
    error(await submit(b, 2), "STALE_TURN"); error(await submit(b), "NOT_YOUR_TURN");
    now += 60000;
    const caught = (await t.app.rooms.current(a.id)).room!; expect(caught.debate!.activeSlot).toBe("B");
    error(await submit(b), "LIMIT_REACHED", 429);
  });
  it("rule 4.8: racing same-key submissions create one message; different-content races conflict", async () => {
    await start(); now = startsAt; const key = randomUUID();
    const responses = await Promise.all([submit(a, 1, "Same", key), submit(a, 1, "Same", key)]);
    responses.forEach(snapshot); expect((await t.app.rooms.current(a.id)).room!.messages).toHaveLength(2);
    const second = randomUUID();
    const race = await Promise.all([submit(b, 1, "First", second), submit(b, 1, "Second", second)]);
    expect(race.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    error(race.find((r) => r.statusCode === 409)!, "REQUEST_CONFLICT");
  });
  it("rule 4.6,4.8: a poller racing a submit applies the expiry exactly once", async () => {
    await start(); now = startsAt + 60000;
    const [, response] = await Promise.all([repo.catchup(roomId), submit(a)]);
    error(response, "NOT_YOUR_TURN");
    const fields = await repo.readRoom(roomId);
    expect(fields.version).toBe("9");
    expect(Number(fields.deadline)).toBe(startsAt + 120000);
  });
  it("rule 4.8: the defensive TURN_EXPIRED guard rejects even if reconciliation is bypassed", async () => {
    await start(); now = startsAt + 60000;
    // Normally unreachable: production catch-up has already moved the turn. Isolate this guard
    // using the real submit script and a deliberately disabled catch-up in this test chunk only.
    const prelude = readFileSync(new URL("../rooms/lua/clock-common.lua", import.meta.url), "utf8");
    const source = readFileSync(new URL("../rooms/lua/submit.lua", import.meta.url), "utf8");
    const result = await t.redis.eval(prelude + "\nclock_catchup = function() return false end\n" + source, 5,
      `player:${a.id}`, `room:${roomId}`, `room:${roomId}:messages`, `room:${roomId}:requests`, deadlinesKey,
      roomId, a.id, "1", "Hi", randomUUID(), "test-content-hash", String(now));
    expect(JSON.parse(String(result)).status).toBe("TURN_EXPIRED");
    expect((await repo.readRoom(roomId)).activeSlot).toBe("A");
  });
  it("rule 4.12: reads catch up and atomically update the sorted deadline", async () => {
    await start(); now = startsAt + 65000;
    await t.app.rooms.current(a.id);
    expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(startsAt + 120000);
  });
  it("rule 4.11: HTTP rejects invalid text, UUIDs and ordinals before Lua", async () => {
    for (const text of ["", " \t\n", "x".repeat(601), "bad\rtext", "bad\u0080text"]) {
      error(await submit(a, 1, text), "INVALID_REQUEST", 400);
    }
    error(await submit(a, 1, "Text", "not-a-uuid"), "INVALID_REQUEST", 400);
    error(await submit(a, 0), "INVALID_REQUEST", 400);
    await start(); now = startsAt; snapshot(await submit(a, 1, "😀".repeat(600)));
  });
  it("rule 4.13: only server time advances clocks; malformed/outsider/stale/closed/expired requests cannot post", async () => {
    error(await t.app.inject({ method: "POST", url: `/api/rooms/${roomId}/messages`, payload: { ordinal: 1, text: "Hi", requestKey: randomUUID() } }), "UNAUTHENTICATED", 401);
    error(await post(a, "/api/rooms/r_AAAAAAAAAAAAAAAAAAAAAA/messages", { ordinal: 1, text: "Hi", requestKey: randomUUID(), now: startsAt + 999999 }), "STALE_ROOM");
    await start(); const before = await repo.readRoom(roomId);
    error(await post(a, `/api/rooms/${roomId}/messages`, { ordinal: 1, text: "Hi", requestKey: randomUUID(), now: startsAt + 999999 }), "DEBATE_NOT_STARTED");
    expect(await repo.readRoom(roomId)).toEqual(before);
    await post(b, `/api/rooms/${roomId}/leave`); error(await submit(a), "ROOM_CLOSED");
    expect(await t.redis.zscore(deadlinesKey, roomId)).toBeNull();
    expect((await repo.readRoom(roomId)).deadline).toBeUndefined();
    expect(await repo.catchup(roomId)).toMatchObject({ changed: false, deadline: null });
    await t.redis.hset(`room:${roomId}`, "expiresAt", 0); error(await submit(a), "ROOM_EXPIRED", 410);
    expect(await repo.catchup(roomId)).toMatchObject({ changed: false });
    await t.redis.del(`room:${roomId}`); error(await submit(a), "ROOM_NOT_FOUND", 404);
    expect(await repo.catchup(roomId)).toMatchObject({ changed: false });
  });
});

describe("Slice 4 worker and live pushes", () => {
  it("rule 4.6,4.12: two pollers reconcile once, update the set and publish; not-yet-due rooms stay untouched", async () => {
    await start();
    const logger = { error: vi.fn() }; const publish = vi.spyOn(t.redis, "publish");
    const tick = createDeadlineTick(t.redis, logger, { now: () => now, deadlinesKey });
    const before = await repo.readRoom(roomId); await tick();
    expect(await repo.readRoom(roomId)).toEqual(before); expect(publish).not.toHaveBeenCalled();
    now = startsAt + 60000; await Promise.all([tick(), tick()]);
    expect(publish).toHaveBeenCalledTimes(1); expect(publish).toHaveBeenCalledWith(ROOM_EVENTS_CHANNEL, roomId);
    expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(startsAt + 120000);
    now = startsAt + 240000; await tick();
    expect((await repo.readRoom(roomId)).phase).toBe("ended"); expect(await t.redis.zscore(deadlinesKey, roomId)).toBeNull();
  });
  it("rule 4.6,4.12: due uses Redis time, respects its limit and leaves members for catch-up", async () => {
    const actual = new RoomRepo(t.redis, { deadlinesKey });
    const time = await t.redis.time(); const redisNow = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
    await t.redis.zadd(deadlinesKey, redisNow - 100, "past", redisNow - 50, "past2", redisNow + 60000, "future");
    vi.spyOn(Date, "now").mockReturnValue(redisNow + 86400000);
    expect(await actual.due(1)).toEqual(["past"]);
    expect(await actual.due()).toEqual(["past", "past2"]);
    expect(await t.redis.zcard(deadlinesKey)).toBe(3);
  });
  it("rule 4.12: missing, expired and closed rooms are removed; a room error does not abort the batch", async () => {
    await start(); now = startsAt + 60000;
    await t.redis.zadd(deadlinesKey, now - 1, "missing");
    const logger = { error: vi.fn() };
    const tick = createDeadlineTick(t.redis, logger, { now: () => now, deadlinesKey });
    vi.spyOn(RoomRepo.prototype, "catchup").mockRejectedValueOnce(new Error("Redis failure"));
    await tick(); expect(logger.error).toHaveBeenCalledTimes(1);
    expect((await repo.readRoom(roomId)).activeSlot).toBe("B");
    await tick(); expect(await t.redis.zscore(deadlinesKey, "missing")).toBeNull();
    await t.redis.hset('room:' + roomId, "expiresAt", 0); await t.redis.zadd(deadlinesKey, now, roomId);
    await tick(); expect(await t.redis.zscore(deadlinesKey, roomId)).toBeNull();
    await t.redis.hset('room:' + roomId, "expiresAt", now + 60000, "closed", 1); await t.redis.zadd(deadlinesKey, now, roomId);
    await tick(); expect(await t.redis.zscore(deadlinesKey, roomId)).toBeNull();
    expect((await repo.readRoom(roomId)).deadline).toBeUndefined();
  });
  it("rule 4.1-4.14: an idle turn passes and pushes to two players using real Redis TIME, without player action", async () => {
    io = new Server(t.app.server); drain = registerSockets(io, t.app.rooms, t.redis, { verifyKeys: t.app.sessions.verifyKeys, logger: t.app.log });
    stopSubscriber = await subscribeRoomEvents(await connectedRedis(), t.app.rooms, t.app.log);
    const origin = await t.app.listen({ host: "127.0.0.1", port: 0 });
    const next = (socket: Client, predicate: (room: NonNullable<RoomResponse["room"]>) => boolean) => new Promise<NonNullable<RoomResponse["room"]>>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); socket.off("room:snapshot", receive); };
      const receive = (raw: RoomResponse) => { const room = RoomResponse.parse(raw).room; if (room && predicate(room)) { cancel(); resolve(room); } };
      const timer = setTimeout(() => { cancel(); reject(new Error("Clock snapshot timed out")); }, 4000);
      cancellations.push(cancel); socket.on("room:snapshot", receive);
    });
    async function connect(who: Player) {
      const socket: Client = clientIo(origin, { autoConnect: false, forceNew: true, reconnection: false, transports: ["websocket"], extraHeaders: { Cookie: `quarrel_access=${who.cookies.quarrel_access}` } });
      clients.push(socket); const initial = next(socket, () => true); socket.connect(); await initial; return socket;
    }
    const sa = await connect(a), sb = await connect(b);
    await start();
    const time = await t.redis.time(); const redisNow = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
    now = redisNow; // Snapshot reads cannot expire this turn; only the real Redis-time poller can.
    const deadline = redisNow + 100;
    await t.redis.hset('room:' + roomId, "startsAt", redisNow - 1, "deadline", deadline, "a.remainingMs", 100);
    await t.redis.zadd(deadlinesKey, deadline, roomId);
    const passed = [sa, sb].map((socket) => next(socket, (room) => room.debate?.activeSlot === "B"));
    stopPoller = startDeadlineLoop(createDeadlineTick(t.redis, { error: vi.fn() }, { deadlinesKey }), { error: vi.fn() }, 10);
    const views = await Promise.all(passed);
    expect(views.map((room) => room.you.slot)).toEqual(["A", "B"]);
    expect(views[0]!.messages).toEqual(views[1]!.messages);
    expect(Date.parse(views[0]!.debate!.deadline!)).toBe(deadline + 60000);
    expect(views[0]!.debate!.clocks.A).toBe(0);
  });
});
