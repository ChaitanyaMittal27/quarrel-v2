import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomResponse, ERROR_STATUS, type RoomSnapshot } from "@quarrel/shared/contract";
import { themes } from "@quarrel/shared/config";
import { newPlayerId, secretKey, signAccessToken } from "../common/tokens";
import { TEST_SECRET, testApp, type TestApp } from "./helpers";

type Player = { id: string; cookies: { quarrel_access: string } };
type Response = Awaited<ReturnType<TestApp["app"]["inject"]>>;
let t: TestApp;
const keys = new Set<string>();
beforeEach(async () => { t = await testApp(); });
afterEach(async () => {
  if (keys.size) await t.redis.del(...keys);
  await t.close();
  keys.clear();
});
async function player(): Promise<Player> {
  const id = newPlayerId();
  keys.add(`player:${id}`); keys.add(`presence:${id}`);
  return { id, cookies: { quarrel_access: await signAccessToken(id, secretKey(TEST_SECRET)) } };
}
function view(response: Response): RoomSnapshot {
  expect(response.statusCode, response.body).toBe(200);
  const room = RoomResponse.parse(response.json()).room!;
  keys.add(`room:${room.roomId}`); keys.add(`code:${room.code}`);
  return room;
}
function error(response: Response, code: keyof typeof ERROR_STATUS) {
  expect(response.statusCode, response.body).toBe(ERROR_STATUS[code]);
  expect(response.json().error.code).toBe(code);
}
const create = (who: Player, input: Record<string, unknown> = {}) =>
  t.app.inject({ method: "POST", url: "/api/rooms", cookies: who.cookies, payload: { name: "Ann", topic: "Test topic", ...input } });
const join = (who: Player, code: string) =>
  t.app.inject({ method: "POST", url: "/api/rooms/join", cookies: who.cookies, payload: { name: "Bo", code } });
const position = (who: Player, roomId: string, text: unknown, extra = {}) =>
  t.app.inject({ method: "PUT", url: `/api/rooms/${roomId}/position`, cookies: who.cookies, payload: { text, ...extra } });
const ready = (who: Player, roomId: string, value = true) =>
  t.app.inject({ method: "PUT", url: `/api/rooms/${roomId}/ready`, cookies: who.cookies, payload: { ready: value } });
const read = async (who: Player) => view(await t.app.inject({ method: "GET", url: "/api/session", cookies: who.cookies }));
async function pair() {
  const a = await player(), b = await player();
  const room = view(await create(a));
  view(await join(b, room.code));
  return { a, b, roomId: room.roomId };
}

describe("Slice 2 setup", () => {
  it("rule S2.1: creation stores trimmed topic and defaults; setup remains fixed on retries and other writes", async () => {
    const a = await player(), b = await player();
    const room = view(await create(a, { topic: "  A topic  " }));
    expect(room.setup).toEqual({ phase: "waiting", theme: "courtroom", topic: "A topic", durationSec: 240, positions: { A: null, B: null } });
    const again = view(await create(a, { topic: "Different", theme: "jungle", durationSec: 600 }));
    expect(again.setup).toEqual(room.setup);
    expect(again.version).toBe(room.version);
    view(await join(b, room.code));
    const changed = view(await position(a, room.roomId, "My view", { slot: "B", theme: "detective", topic: "Changed", durationSec: 120 }));
    expect(changed.setup).toMatchObject({ theme: "courtroom", topic: "A topic", durationSec: 240, positions: { A: "My view", B: null } });
    expect((await t.app.inject({ method: "PUT", url: `/api/rooms/${room.roomId}/setup`, cookies: a.cookies, payload: { topic: "Changed" } })).statusCode).toBe(404);
  });

  it.each(themes)("rule S2.1: theme $id and every supported duration survive the snapshot", async (theme) => {
    for (const durationSec of [120, 240, 360, 600]) {
      const room = view(await create(await player(), { theme: theme.id, durationSec }));
      expect(room.setup).toMatchObject({ theme: theme.id, durationSec });
      const hash = await t.redis.hgetall(`room:${room.roomId}`);
      expect(hash).toMatchObject({ phase: "waiting", theme: theme.id, topic: "Test topic", durationSec: String(durationSec) });
    }
  });

  it.each(["", "  ", "a".repeat(241), "Topic\n", "\tTopic", "a\u0085", null, 4, undefined])(
    "rule S2.1: bad topic %j yields INVALID_TOPIC without creating a seat", async (topic) => {
      const a = await player();
      error(await create(a, { topic }), "INVALID_TOPIC");
      expect(await t.redis.get(`player:${a.id}`)).toBeNull();
    });

  it("rule S2.1: topic length uses code points, allowing one or 240 emoji", async () => {
    for (const size of [1, 240]) {
      const topic = "😀".repeat(size);
      expect(view(await create(await player(), { topic })).setup.topic).toBe(topic);
    }
    error(await create(await player(), { topic: "😀".repeat(241) }), "INVALID_TOPIC");
  });

  it.each([{ theme: "unknown" }, { theme: null }, { theme: "Courtroom" }, { durationSec: 121 }, { durationSec: "240" }, { durationSec: null }])(
    "rule S2.1: invalid theme or duration %j yields INVALID_REQUEST", async (input) => {
      error(await create(await player(), input), "INVALID_REQUEST");
    });

  it("rule S2.2: join takes B and moves waiting to positions exactly once", async () => {
    const a = await player(), b = await player();
    const room = view(await create(a));
    expect(room.setup.phase).toBe("waiting");
    const joined = view(await join(b, room.code));
    expect(joined.setup.phase).toBe("positions");
    expect(joined.version).toBe(2);
    expect(view(await join(b, room.code)).version).toBe(2);
    expect((await read(a)).setup).toEqual(joined.setup);
  });

  it("rule S2.3: position is own-seat only, trimmed and multiline, with tab/newline allowed", async () => {
    const { a, b, roomId } = await pair();
    const saved = view(await position(a, roomId, "  First line\n\tSecond line  ", { slot: "B", playerId: b.id }));
    expect(saved.setup.positions).toEqual({ A: "First line\n\tSecond line", B: null });
    expect(saved.version).toBe(3);
    expect(view(await position(b, roomId, "B's view")).setup.positions).toEqual({ A: "First line\n\tSecond line", B: "B's view" });
  });

  it.each(["", " \n\t ", "a".repeat(601), "Bad\r\ntext", "Bad\u0000text", "Bad\u007f", "Bad\u0085", null, 2, undefined])(
    "rule S2.3: bad position %j yields INVALID_POSITION and leaves state unchanged", async (text) => {
      const { a, roomId } = await pair();
      error(await position(a, roomId, text), "INVALID_POSITION");
      const current = await read(a);
      expect(current.version).toBe(2);
      expect(current.setup.positions).toEqual({ A: null, B: null });
    });

  it("rule S2.3: position boundary counts code points and rejects malformed request shapes", async () => {
    const { a, roomId } = await pair();
    expect(view(await position(a, roomId, "😀".repeat(600))).setup.positions.A).toBe("😀".repeat(600));
    error(await position(a, roomId, "😀".repeat(601)), "INVALID_POSITION");
    expect(view(await position(a, roomId, "x")).setup.positions.A).toBe("x");
    error(await t.app.inject({ method: "PUT", url: `/api/rooms/${roomId}/position`, cookies: a.cookies, payload: [] }), "INVALID_REQUEST");
  });

  it("rule S2.3: position enforces auth, membership, stale-tab guard and expiry before phase", async () => {
    const { a, roomId } = await pair();
    error(await t.app.inject({ method: "PUT", url: `/api/rooms/${roomId}/position`, payload: { text: "My view" } }), "UNAUTHENTICATED");
    error(await position(await player(), roomId, "My view"), "ROOM_NOT_FOUND");
    error(await position(a, "r_AAAAAAAAAAAAAAAAAAAAAA", "My view"), "STALE_ROOM");
    await t.redis.hset(`room:${roomId}`, "expiresAt", "0");
    error(await position(a, roomId, "My view"), "ROOM_EXPIRED");
    expect(await t.redis.hget(`room:${roomId}`, "a.position")).toBe("");
  });

  it("rule S2.4: both players see the same public positions with their own viewer slot", async () => {
    const { a, b, roomId } = await pair();
    view(await position(a, roomId, "A view"));
    view(await position(b, roomId, "B view"));
    const aView = await read(a), bView = await read(b);
    expect(aView.setup.positions).toEqual({ A: "A view", B: "B view" });
    expect(bView.setup.positions).toEqual(aView.setup.positions);
    expect(aView.you.slot).toBe("A"); expect(bView.you.slot).toBe("B");
  });

  it("rule S2.5: saving clears only the author's ready, including an identical saved position", async () => {
    const { a, b, roomId } = await pair();
    await position(a, roomId, "A view"); await position(b, roomId, "B view");
    await ready(a, roomId);
    expect(view(await position(a, roomId, "A view")).players.map((seat) => seat.ready)).toEqual([false, false]);
    await ready(b, roomId);
    const changed = view(await position(a, roomId, "Edited A"));
    expect(changed.players.map((seat) => seat.ready)).toEqual([false, true]);
    expect(changed.setup.phase).toBe("positions");
  });

  it("rule S2.5: a changed save increments version/emits once, but an unchanged unready save does neither", async () => {
    const { a, roomId } = await pair();
    const events = vi.fn(); t.app.rooms.events.on("roomChanged", events);
    const saved = view(await position(a, roomId, "A view"));
    expect(saved.version).toBe(3); expect(events).toHaveBeenCalledTimes(1);
    expect(view(await position(a, roomId, "A view")).version).toBe(3);
    expect(events).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])("rule S2.6: ready:%s and positions are rejected while waiting", async (value) => {
    const a = await player(); const room = view(await create(a));
    error(await ready(a, room.roomId, value), "WRONG_PHASE");
    error(await position(a, room.roomId, "My view"), "WRONG_PHASE");
    expect((await read(a)).version).toBe(1);
  });

  it("rule S2.6: ready:true requires own position; ready:false is allowed in positions", async () => {
    const { a, b, roomId } = await pair();
    await position(b, roomId, "B view");
    error(await ready(a, roomId), "POSITION_REQUIRED");
    expect(view(await ready(a, roomId, false)).players[0]!.ready).toBe(false);
    await position(a, roomId, "A view");
    expect(view(await ready(a, roomId)).players[0]!.ready).toBe(true);
  });

  it("rule S2.7: simultaneous ready requests cause exactly one planning transition, independent of presence", async () => {
    const { a, b, roomId } = await pair();
    await position(a, roomId, "A view"); await position(b, roomId, "B view");
    const events = vi.fn(); t.app.rooms.events.on("roomChanged", events);
    const initial = await t.redis.hgetall(`room:${roomId}`);
    expect(initial.phase).toBe("positions");
    const results = await Promise.all([ready(a, roomId), ready(b, roomId)]);
    const responses = results.map(view);
    // HTTP mapping may observe the other request's completed write. Either response can
    // therefore be v6; the final hash and exactly two version increments prove the lock.
    for (const response of responses) {
      expect([5, 6]).toContain(response.version);
      expect(["positions", "planning"]).toContain(response.setup.phase);
      expect(response.players.find((p) => p.slot === response.you.slot)?.ready).toBe(true);
    }
    expect(responses.some((response) => response.version === 6 && response.setup.phase === "planning")).toBe(true);
    const locked = await t.redis.hgetall(`room:${roomId}`);
    expect(locked).toMatchObject({ phase: "planning", "a.ready": "1", "b.ready": "1" });
    expect(Number(locked.version)).toBe(Number(initial.version) + 2);
    const planned = await read(a);
    expect(planned.setup.phase).toBe("planning");
    expect(planned.bothReady).toBe(false); // No sockets; phase locking depends on ready flags.
    expect(planned.version).toBe(6);
    expect(events).toHaveBeenCalledTimes(2);
    expect(view(await join(a, planned.code)).setup.phase).toBe("planning");
    expect(view(await create(a, { topic: "Ignored retry" })).version).toBe(6);
    const before = await t.redis.hgetall(`room:${roomId}`);
    for (const who of [a, b]) {
      error(await ready(who, roomId, true), "WRONG_PHASE");
      error(await ready(who, roomId, false), "WRONG_PHASE");
      error(await position(who, roomId, "Late edit"), "WRONG_PHASE");
    }
    expect(await t.redis.hgetall(`room:${roomId}`)).toEqual(before);
    expect(events).toHaveBeenCalledTimes(2);
  });

  it.each(["waiting", "positions", "planning"])("rule S2.8: leaving during %s closes the room and preserves setup", async (phase) => {
    const a = await player(), b = await player(); const room = view(await create(a));
    if (phase !== "waiting") await join(b, room.code);
    if (phase === "planning") {
      await position(a, room.roomId, "A view"); await position(b, room.roomId, "B view");
      await ready(a, room.roomId); await ready(b, room.roomId);
    }
    const leaver = phase === "waiting" ? a : b;
    const response = await t.app.inject({ method: "POST", url: `/api/rooms/${room.roomId}/leave`, cookies: leaver.cookies });
    expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ room: null });
    expect(await t.redis.hgetall(`room:${room.roomId}`)).toMatchObject({ phase, closed: "1", topic: "Test topic" });
    if (phase !== "waiting") expect((await read(a)).players[1]!.left).toBe(true);
    error(await join(await player(), room.code), "ROOM_CLOSED");
  });
});
