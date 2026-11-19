import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "socket.io";
import { io as clientIo, type Socket } from "socket.io-client";
import { RoomResponse, type ClientToServerEvents, type ServerToClientEvents } from "@quarrel/shared/contract";
import { themes } from "@quarrel/shared/config";
import { newPlayerId, secretKey, signAccessToken } from "../common/tokens";
import { RoomRepo } from "../rooms/room-repo";
import { registerSockets, type GameServer } from "../api/sockets";
import { testApp, TEST_SECRET, type TestApp } from "./helpers";

type Player = { id: string; cookies: { quarrel_access: string } };
type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let t: TestApp, repo: RoomRepo, deadlinesKey: string;
let io: GameServer | undefined, drain: (() => Promise<void>) | undefined;
const keys = new Set<string>(), clients: Client[] = [], cancellations: (() => void)[] = [];
beforeEach(async () => {
  deadlinesKey = `deadlines:choices-${randomBytes(8).toString("hex")}`; keys.add(deadlinesKey);
  t = await testApp({ rooms: { deadlinesKey } }); repo = new RoomRepo(t.redis, { deadlinesKey });
});
afterEach(async () => {
  cancellations.splice(0).forEach((cancel) => cancel()); clients.splice(0).forEach((client) => client.disconnect());
  await io?.close(); await drain?.(); io = undefined; drain = undefined;
  if (keys.size) await t.redis.del(...keys); keys.clear(); await t.close(); vi.restoreAllMocks();
});
async function player(): Promise<Player> {
  const id = newPlayerId(); keys.add(`player:${id}`); keys.add(`presence:${id}`);
  return { id, cookies: { quarrel_access: await signAccessToken(id, secretKey(TEST_SECRET)) } };
}
const post = (who: Player, url: string, payload?: Record<string, unknown>) => t.app.inject({ method: "POST", url, cookies: who.cookies, ...(payload === undefined ? {} : { payload }) });
function view(response: Awaited<ReturnType<typeof post>>) {
  expect(response.statusCode, response.body).toBe(200); const room = RoomResponse.parse(response.json()).room!;
  keys.add(`room:${room.roomId}`); keys.add(`code:${room.code}`); keys.add(`room:${room.roomId}:messages`); keys.add(`room:${room.roomId}:requests`);
  return room;
}
function error(response: Awaited<ReturnType<typeof post>>, code: string, status = 400) {
  expect(response.statusCode, response.body).toBe(status); expect(response.json().error.code).toBe(code);
}
const choices = (who: Player, roomId: string, body: Record<string, unknown>) => post(who, `/api/rooms/${roomId}/choices`, body);
async function pair(phase = "positions", theme = "courtroom") {
  const a = await player(), b = await player();
  const room = view(await post(a, "/api/rooms", { name: "Ann", topic: "Topic", durationSec: 120, theme }));
  if (phase !== "waiting") view(await post(b, "/api/rooms/join", { name: "Bo", code: room.code }));
  if (["planning", "debate", "ended"].includes(phase)) {
    for (const who of [a, b]) {
      await t.app.inject({ method: "PUT", url: `/api/rooms/${room.roomId}/position`, cookies: who.cookies, payload: { text: "A view" } });
      await t.app.inject({ method: "PUT", url: `/api/rooms/${room.roomId}/ready`, cookies: who.cookies, payload: { ready: true } });
    }
  }
  if (phase === "debate" || phase === "ended") {
    await repo.savePlan(room.roomId, { source: "demo", text: "Plan", subtopics: [
      { ordinal: 1, question: "First?", secondsPerPlayer: 60, openerSlot: "A" }, { ordinal: 2, question: "Second?", secondsPerPlayer: 60, openerSlot: "B" },
    ] });
    await repo.refreshPresence(a.id); await repo.refreshPresence(b.id); view(await post(a, `/api/rooms/${room.roomId}/start`));
    if (phase === "ended") await t.redis.hset(`room:${room.roomId}`, "phase", "ended");
  }
  return { a, b, roomId: room.roomId };
}

describe("Stage 5B seat choices", () => {
  it.each(["waiting", "positions", "planning", "debate"])("rule 5B.1: own-seat choices work in %s without changing ready, clocks or the other seat", async (phase) => {
    const { a, roomId } = await pair(phase);
    const before = await repo.readRoom(roomId), events = vi.fn(); t.app.rooms.events.on("roomChanged", events);
    const result = view(await choices(a, roomId, { characterId: "jungle-zebra", lawyerId: "detective-arden" }));
    expect(result.players[0]).toMatchObject({ characterId: "jungle-zebra", lawyerId: "detective-arden" });
    const after = await repo.readRoom(roomId);
    const { version: _version, "a.characterId": _character, "a.lawyerId": _lawyer, ...rest } = after;
    const { version: _beforeVersion, ...original } = before;
    expect(rest).toEqual(original); expect(result.version).toBe(Number(before.version) + 1); expect(events).toHaveBeenCalledTimes(1);
    const again = view(await choices(a, roomId, { characterId: "jungle-zebra", lawyerId: "detective-arden" }));
    expect(again.version).toBe(result.version); expect(events).toHaveBeenCalledTimes(1);
    view(await choices(a, roomId, { characterId: "superhero-scout" }));
    expect((await repo.readRoom(roomId))["a.lawyerId"]).toBe("detective-arden");
    view(await choices(a, roomId, { lawyerId: "jungle-tavi" }));
    expect((await repo.readRoom(roomId))["a.characterId"]).toBe("superhero-scout");
  });
  it("rule 5B.1: ended is rejected and membership, expiry and stale-room checks are rechecked inside Lua", async () => {
    const { a, b, roomId } = await pair("ended");
    error(await choices(a, roomId, { characterId: "jungle-lion" }), "WRONG_PHASE", 409);
    error(await choices(await player(), roomId, { characterId: "jungle-lion" }), "ROOM_NOT_FOUND", 404);
    error(await choices(a, "r_AAAAAAAAAAAAAAAAAAAAAA", { characterId: "jungle-lion" }), "STALE_ROOM", 409);
    const body = { characterId: "jungle-lion" };
    error(await t.app.inject({ method: "POST", url: `/api/rooms/${roomId}/choices`, payload: body }), "UNAUTHENTICATED", 401);
    await t.redis.hset(`room:${roomId}`, "b.left", 1);
    expect(await repo.setChoices(b.id, roomId, body)).toMatchObject({ status: "ROOM_NOT_FOUND" });
    await t.redis.hset(`room:${roomId}`, "expiresAt", 0);
    error(await choices(a, roomId, body), "ROOM_EXPIRED", 410);
    await t.redis.del(`room:${roomId}`); error(await choices(a, roomId, body), "ROOM_NOT_FOUND", 404);
  });
  it("rule 5B.2: invalid IDs fail with INVALID_CHOICE; strict empty/extra-field bodies fail INVALID_REQUEST", async () => {
    const { a, roomId } = await pair();
    for (const body of [{ characterId: "unknown" }, { lawyerId: "jungle-lion" }, { characterId: "" }, { lawyerId: null }, { characterId: 4 }]) {
      error(await choices(a, roomId, body), "INVALID_CHOICE");
    }
    for (const body of [{}, { characterId: "jungle-lion", slot: "B" }, { lawyerId: "courtroom-emery", playerId: a.id }]) {
      error(await choices(a, roomId, body), "INVALID_REQUEST");
    }
    expect(await repo.setChoices(a.id, roomId, { characterId: "bad", lawyerId: "jungle-tavi" })).toMatchObject({ status: "INVALID_CHOICE" });
    expect(await repo.setChoices(a.id, roomId, {})).toMatchObject({ status: "INVALID_CHOICE" });
    expect((await repo.readRoom(roomId))["a.lawyerId"]).toBeUndefined();
  });
  it.each(themes)("rule 5B.3: unset/empty choices resolve theme $id seat defaults and both seats may choose duplicates", async (theme) => {
    const { a, b, roomId } = await pair("positions", theme.id);
    await t.redis.hset(`room:${roomId}`, "a.characterId", "", "b.lawyerId", "");
    const room = (await t.app.rooms.current(a.id)).room!;
    for (const [index, slot] of ["A", "B"].entries()) expect(room.players[index]).toMatchObject({ characterId: theme.defaults.characters[slot as "A" | "B"], lawyerId: theme.defaults.lawyers[slot as "A" | "B"] });
    const same = { characterId: "superhero-inventor", lawyerId: "jungle-fern" };
    await Promise.all([choices(a, roomId, same), choices(b, roomId, same)]);
    const changed = (await t.app.rooms.current(a.id)).room!;
    changed.players.forEach((seat) => expect(seat).toMatchObject(same));
  });
  it("rule 5B.4: each player's sockets receive the saved choice and viewer slot", async () => {
    const { a, b, roomId } = await pair();
    io = new Server(t.app.server); drain = registerSockets(io, t.app.rooms, t.redis, { verifyKeys: t.app.sessions.verifyKeys, logger: t.app.log });
    const origin = await t.app.listen({ host: "127.0.0.1", port: 0 });
    function next(socket: Client, changed = false) { return new Promise<RoomResponse>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); socket.off("room:snapshot", receive); };
      const receive = (raw: RoomResponse) => { const value = RoomResponse.parse(raw); if (!changed || value.room?.players[1]?.lawyerId === "superhero-aster") { cancel(); resolve(value); } };
      const timer = setTimeout(() => { cancel(); reject(new Error("Choice push timed out")); }, 4000);
      cancellations.push(cancel); socket.on("room:snapshot", receive);
    }); }
    async function connect(who: Player) {
      const socket: Client = clientIo(origin, { autoConnect: false, forceNew: true, reconnection: false, transports: ["websocket"], extraHeaders: { Cookie: `quarrel_access=${who.cookies.quarrel_access}` } });
      clients.push(socket); const initial = next(socket); socket.connect(); await initial; return socket;
    }
    const sa = await connect(a), sb = await connect(b), pushes = [next(sa, true), next(sb, true)];
    view(await choices(b, roomId, { characterId: "detective-witness", lawyerId: "superhero-aster" }));
    const views = await Promise.all(pushes);
    expect(views.map((value) => value.room!.you.slot)).toEqual(["A", "B"]);
    expect(views[0]!.room!.players).toEqual(views[1]!.room!.players);
    expect(JSON.stringify(views)).not.toContain(a.id); expect(JSON.stringify(views)).not.toContain(b.id);
  });
});
