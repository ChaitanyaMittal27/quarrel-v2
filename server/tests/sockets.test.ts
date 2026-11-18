import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "socket.io";
import { io as clientIo, type Socket } from "socket.io-client";
import {
  RoomResponse, RoomSnapshotEvent, type ClientToServerEvents, type ServerToClientEvents,
} from "@quarrel/shared/contract";
import { registerSockets, type GameServer } from "../api/sockets";
import { newPlayerId, secretKey, signAccessToken } from "../common/tokens";
import { RoomRepo } from "../rooms/room-repo";
import { TEST_SECRET, TEST_PREVIOUS_SECRET, testApp, type TestApp } from "./helpers";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Identity = { id: string; token: string; cookies: { quarrel_access: string } };
type Response = Awaited<ReturnType<TestApp["app"]["inject"]>>;
let t: TestApp | undefined;
let io: GameServer | undefined;
let drain: (() => Promise<void>) | undefined;
let url: string;
const clients: Client[] = [];
const payloads = new Map<Client, RoomResponse[]>();
const keys = new Set<string>();
const ids = new Set<string>();
const cancelWaiters = new Set<() => void>();

afterEach(async () => {
  try {
    for (const frames of payloads.values()) {
      for (const frame of frames) {
        expect(RoomSnapshotEvent.safeParse(frame).success).toBe(true);
        const raw = JSON.stringify(frame);
        expect(raw).not.toMatch(/"p_[A-Za-z0-9_-]{22}"/);
        for (const id of ids) expect(raw).not.toContain(id);
      }
    }
  } finally {
    for (const cancel of cancelWaiters) cancel();
    clients.forEach((client) => client.disconnect());
    await io?.close();
    await drain?.();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (t) {
      if (keys.size) await t.redis.del(...keys);
      await t.close();
    }
    t = undefined;
    io = undefined;
    drain = undefined;
    clients.length = 0;
    payloads.clear();
    keys.clear();
    ids.clear();
    cancelWaiters.clear();
  }
});

async function start() {
  t = await testApp({ session: { previousSecret: TEST_PREVIOUS_SECRET } });
  io = new Server(t.app.server, { path: "/socket.io" });
  drain = registerSockets(io, t.app.rooms, t.redis, { verifyKeys: t.app.sessions.verifyKeys, logger: t.app.log });
  url = await t.app.listen({ port: 0, host: "127.0.0.1" });
}

async function identity(now?: Date, secret = TEST_SECRET): Promise<Identity> {
  const id = newPlayerId();
  ids.add(id);
  keys.add(`player:${id}`);
  keys.add(`presence:${id}`);
  const token = await signAccessToken(id, secretKey(secret), now);
  return { id, token, cookies: { quarrel_access: token } };
}

function roomOf(response: Response) {
  expect(response.statusCode, response.body).toBe(200);
  const room = RoomResponse.parse(response.json()).room!;
  keys.add(`room:${room.roomId}`);
  keys.add(`code:${room.code}`);
  return room;
}
async function create(who: Identity) {
  return roomOf(await t!.app.inject({ method: "POST", url: "/api/rooms", cookies: who.cookies, payload: { name: "Ann" } }));
}
async function join(who: Identity, code: string) {
  return roomOf(await t!.app.inject({ method: "POST", url: "/api/rooms/join", cookies: who.cookies, payload: { code, name: "Bo" } }));
}
async function pair() {
  const a = await identity(), b = await identity();
  const room = await create(a);
  await join(b, room.code);
  return { a, b, room };
}

function client(cookie?: string, transport: "websocket" | "polling" = "websocket"): Client {
  const socket: Client = clientIo(url, {
    autoConnect: false, forceNew: true, reconnection: false, transports: [transport],
    extraHeaders: cookie === undefined ? {} : { Cookie: cookie },
  });
  clients.push(socket);
  payloads.set(socket, []);
  socket.on("room:snapshot", (payload) => payloads.get(socket)!.push(payload));
  return socket;
}

/** Wait on real events, retaining earlier frames so a fast server cannot outrun the test. */
function waitSnapshot(socket: Client, predicate: (payload: RoomResponse) => boolean, from = 0): Promise<RoomResponse> {
  const existing = payloads.get(socket)!.slice(from).find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timeout);
      socket.off("room:snapshot", receive);
      cancelWaiters.delete(cancel);
    };
    const receive = (payload: RoomResponse) => {
      if (!predicate(payload)) return;
      cancel();
      resolve(payload);
    };
    const timeout = setTimeout(() => { cancel(); reject(new Error("Timed out waiting for room:snapshot")); }, 4000);
    cancelWaiters.add(cancel);
    socket.on("room:snapshot", receive);
  });
}

async function connect(who: Identity, transport: "websocket" | "polling" = "websocket") {
  const socket = client(`unrelated=ok; quarrel_access=${who.token}`, transport);
  const first = waitSnapshot(socket, () => true);
  socket.connect();
  const snapshot = await first;
  expect(socket.connected).toBe(true);
  return { socket, snapshot };
}

async function rejected(cookie?: string) {
  const socket = client(cookie);
  const message = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for connect_error")), 4000);
    cancelWaiters.add(() => clearTimeout(timeout));
    socket.once("connect_error", (error) => { clearTimeout(timeout); resolve(error.message); });
  });
  socket.connect();
  return message;
}
const mark = (socket: Client) => payloads.get(socket)!.length;

function waitDebug(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for socket debug log")), 4000);
    cancelWaiters.add(() => clearTimeout(timeout));
    vi.spyOn(t!.app.log, "debug").mockImplementation(() => { clearTimeout(timeout); resolve(); });
  });
}

describe("Socket.IO handshake (rule 1.1)", () => {
  it("rejects a missing cookie as UNAUTHENTICATED", async () => {
    await start();
    expect(await rejected()).toBe("UNAUTHENTICATED");
  });
  it("rejects an expired access token as SESSION_EXPIRED", async () => {
    await start();
    const who = await identity(new Date(Date.now() - 16 * 60_000));
    expect(await rejected(`quarrel_access=${who.token}`)).toBe("SESSION_EXPIRED");
  });
  it("rejects a tampered token as UNAUTHENTICATED", async () => {
    await start();
    const who = await identity();
    const [header, payload, signature] = who.token.split(".");
    const tampered = `${header}.${payload}.${signature![0] === "a" ? "b" : "a"}${signature!.slice(1)}`;
    expect(await rejected(`quarrel_access=${tampered}`)).toBe("UNAUTHENTICATED");
  });
  it.each(["websocket", "polling"] as const)("valid token connects over %s and receives its current view", async (transport) => {
    await start();
    const who = await identity();
    const room = await create(who);
    const { snapshot } = await connect(who, transport);
    expect(snapshot.room).toMatchObject({ roomId: room.roomId, you: { slot: "A" } });
    expect(snapshot.room!.players[0]!.connected).toBe(true);
  });
  it("accepts the previous signing secret through the existing verifier", async () => {
    await start();
    const who = await identity(undefined, TEST_PREVIOUS_SECRET);
    await create(who);
    expect((await connect(who)).snapshot.room!.you.slot).toBe("A");
  });
  it("handshake identifies the player without requiring a room or accepting a room from the client", async () => {
    await start();
    const who = await identity();
    expect((await connect(who)).snapshot).toEqual({ room: null });
  });
});

describe("per-player push (rules 1.13, 1.17)", () => {
  it("A receives B's join, and ready toggles push each player's own you.slot", async () => {
    await start();
    const a = await identity(), b = await identity();
    const room = await create(a);
    const ca = await connect(a);
    const joined = waitSnapshot(ca.socket, (payload) => payload.room?.players.length === 2);
    await join(b, room.code);
    expect((await joined).room!.players[1]!.name).toBe("Bo");
    const cb = await connect(b);
    for (const value of [true, false]) {
      const predicate = (payload: RoomResponse) => payload.room?.players[1]?.ready === value;
      const aUpdate = waitSnapshot(ca.socket, predicate, mark(ca.socket));
      const bUpdate = waitSnapshot(cb.socket, predicate, mark(cb.socket));
      const response = await t!.app.inject({ method: "PUT", url: `/api/rooms/${room.roomId}/ready`, cookies: b.cookies, payload: { ready: value } });
      expect(response.statusCode).toBe(200);
      expect((await aUpdate).room!.you.slot).toBe("A");
      expect((await bUpdate).room!.you.slot).toBe("B");
    }
  });
  it("all tabs receive their player's view, without room-wide channel membership", async () => {
    await start();
    const { a, b, room } = await pair();
    const a1 = await connect(a), a2 = await connect(a), cb = await connect(b);
    const waits = [a1, a2, cb].map(({ socket }) => waitSnapshot(socket, (payload) => payload.room?.players[0]?.ready === true, mark(socket)));
    await t!.app.inject({ method: "PUT", url: `/api/rooms/${room.roomId}/ready`, cookies: a.cookies, payload: { ready: true } });
    expect((await Promise.all(waits)).map((payload) => payload.room!.you.slot)).toEqual(["A", "A", "B"]);
    expect(io!.sockets.adapter.rooms.has(`player:${a.id}`)).toBe(true);
    for (const socket of io!.sockets.sockets.values()) {
      expect([...socket.rooms]).toEqual([socket.id, `player:${socket.data.playerId}`]);
    }
  });
});

describe("presence (rule 1.11)", () => {
  it("B connecting/disconnecting changes A's equal-version snapshot and clears the key", async () => {
    await start();
    const { a, b, room } = await pair();
    const ca = await connect(a);
    const online = waitSnapshot(ca.socket, (payload) => payload.room?.players[1]?.connected === true);
    const cb = await connect(b);
    expect((await online).room!.version).toBe(room.version + 1); // pair() joined B after room was captured
    const offline = waitSnapshot(ca.socket, (payload) => payload.room?.players[1]?.connected === false, mark(ca.socket));
    cb.socket.disconnect();
    const update = await offline;
    expect(update.room!.version).toBe((await online).room!.version);
    expect(await t!.redis.exists(`presence:${b.id}`)).toBe(0);
  });
  it("closing one of two tabs keeps presence; closing the last clears it", async () => {
    await start();
    const { a, b } = await pair();
    const ca = await connect(a);
    const b1 = await connect(b), b2 = await connect(b);
    b1.socket.disconnect();
    // A readiness change is an event barrier after the disconnect; no fixed sleep.
    const connected = waitSnapshot(ca.socket, (payload) => payload.room?.players[0]?.ready === true, mark(ca.socket));
    await t!.app.inject({ method: "PUT", url: `/api/rooms/${b1.snapshot.room!.roomId}/ready`, cookies: a.cookies, payload: { ready: true } });
    expect((await connected).room!.players[1]!.connected).toBe(true);
    expect(await t!.redis.exists(`presence:${b.id}`)).toBe(1);
    const offline = waitSnapshot(ca.socket, (payload) => payload.room?.players[1]?.connected === false, mark(ca.socket));
    b2.socket.disconnect();
    await offline;
    expect(await t!.redis.exists(`presence:${b.id}`)).toBe(0);
  });
  it("refreshes a 35s key every 10s while open, and stops refreshing after disconnect", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await start();
    const { a, b } = await pair();
    const ca = await connect(a), cb = await connect(b);
    expect(await t!.redis.pttl(`presence:${b.id}`)).toBeGreaterThan(30_000);
    await t!.redis.pexpire(`presence:${b.id}`, 5000);
    const refreshPresence = RoomRepo.prototype.refreshPresence;
    const refreshed = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for presence renewal")), 4000);
      cancelWaiters.add(() => clearTimeout(timeout));
      vi.spyOn(RoomRepo.prototype, "refreshPresence").mockImplementation(async function (this: RoomRepo, playerId) {
        await refreshPresence.call(this, playerId);
        if (playerId === b.id) { clearTimeout(timeout); resolve(); }
      });
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await refreshed; // The interval schedules async Redis work; wait for its actual SET reply.
    expect(await t!.redis.pttl(`presence:${b.id}`)).toBeGreaterThan(30_000);
    const offline = waitSnapshot(ca.socket, (payload) => payload.room?.players[1]?.connected === false, mark(ca.socket));
    cb.socket.disconnect();
    await offline;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await t!.redis.exists(`presence:${b.id}`)).toBe(0);
  });
});

describe("leave and snapshot failures", () => {
  it("leaver's tabs receive null and the remaining player sees the vacated seat (1.14-1.15)", async () => {
    await start();
    const { a, b, room } = await pair();
    const ca = await connect(a), b1 = await connect(b), b2 = await connect(b);
    const aUpdate = waitSnapshot(ca.socket, (payload) => payload.room?.players[1]?.left === true, mark(ca.socket));
    const bUpdates = [b1, b2].map(({ socket }) => waitSnapshot(socket, (payload) => payload.room === null));
    const response = await t!.app.inject({ method: "POST", url: `/api/rooms/${room.roomId}/leave`, cookies: b.cookies });
    expect(response.statusCode).toBe(200);
    expect(await Promise.all(bUpdates)).toEqual([{ room: null }, { room: null }]);
    expect((await aUpdate).room!.players[1]).toMatchObject({ left: true, connected: false });
  });
  it("an expired snapshot is debug-logged and skipped without breaking subsequent pushes", async () => {
    await start();
    const who = await identity();
    const room = await create(who);
    const { socket } = await connect(who);
    const expiredLog = waitDebug();
    await t!.redis.hset(`room:${room.roomId}`, "expiresAt", "0");
    t!.app.rooms.events.emit("roomChanged", room.roomId);
    await expiredLog;
    await t!.redis.hset(`room:${room.roomId}`, "expiresAt", String(Date.now() + 60_000));
    const next = waitSnapshot(socket, (payload) => payload.room?.players[0]?.ready === true, mark(socket));
    expect((await t!.app.inject({ method: "PUT", url: `/api/rooms/${room.roomId}/ready`, cookies: who.cookies, payload: { ready: true } })).statusCode).toBe(200);
    expect((await next).room!.players[0]!.ready).toBe(true);
  });

  it("rejects an invalid pushed response and still sends the other player's valid view", async () => {
    await start();
    const { a, b, room } = await pair();
    const ca = await connect(a), cb = await connect(b);
    const valid = await t!.app.rooms.current(a.id);
    const invalid = { ...valid, secret: "internal-only" };
    const current = vi.spyOn(t!.app.rooms, "current").mockResolvedValueOnce(invalid);
    const skipped = waitDebug();
    const bUpdate = waitSnapshot(cb.socket, (payload) => payload.room?.players[0]?.ready === true, mark(cb.socket));
    // Directly request a notification after the raw change, so only the push consumes the stub.
    await t!.redis.hset(`room:${room.roomId}`, "a.ready", "1");
    t!.app.rooms.events.emit("roomChanged", room.roomId);
    await skipped;
    expect((await bUpdate).room!.you.slot).toBe("B");
    current.mockRestore();
    const aUpdate = waitSnapshot(ca.socket, (payload) => payload.room?.players[0]?.ready === true, mark(ca.socket));
    t!.app.rooms.events.emit("roomChanged", room.roomId);
    expect((await aUpdate).room!.you.slot).toBe("A");
  });
});
