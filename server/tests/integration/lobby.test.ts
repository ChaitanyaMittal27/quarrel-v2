import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "socket.io";
import { io as clientIo, type Socket } from "socket.io-client";
import { RoomResponse, type ClientToServerEvents, type ServerToClientEvents } from "@quarrel/shared/contract";
import { registerSockets, type GameServer } from "../../api/sockets";
import { hashRefreshToken } from "../../common/tokens";
import { testApp, type TestApp } from "../helpers";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let t: TestApp;
let io: GameServer;
let drain: () => Promise<void>;
let origin: string;
const clients: Client[] = [];
const players: Player[] = [];
const keys = new Set<string>();
const cancelWaiters = new Set<() => void>();

/** A separate browser-style cookie jar per player; HttpOnly cookies stay out of snapshots. */
class Player {
  readonly cookies = new Map<string, string>();
  readonly paths = new Map<string, string>();
  constructor() { players.push(this); }
  header(path = "/socket.io") {
    return [...this.cookies].filter(([name]) => {
      const scope = this.paths.get(name) ?? "/";
      return path === scope || path.startsWith(scope.endsWith("/") ? scope : `${scope}/`);
    }).map(([name, value]) => `${name}=${value}`).join("; ");
  }
  async request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(`${origin}${path}`, {
      method, headers: { Cookie: this.header(path), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair!.indexOf("=");
      const name = pair!.slice(0, index), value = pair!.slice(index + 1);
      this.cookies.set(name, value);
      this.paths.set(name, /;\s*Path=([^;]+)/i.exec(cookie)?.[1] ?? "/");
      if (name === "quarrel_access" && value) {
        const id = JSON.parse(Buffer.from(value.split(".")[1]!, "base64url").toString()).sub;
        keys.add(`player:${id}`); keys.add(`presence:${id}`);
      }
      if (name === "quarrel_refresh" && value) keys.add(`refresh:${hashRefreshToken(value)}`);
    }
    const payload: unknown = response.status === 204 ? null : await response.json();
    const room = RoomResponse.safeParse(payload);
    if (room.success && room.data.room) {
      keys.add(`room:${room.data.room.roomId}`); keys.add(`code:${room.data.room.code}`);
    }
    return { status: response.status, payload };
  }
  async room(path: string, method = "GET", body?: unknown) {
    const response = await this.request(path, method, body);
    expect(response.status).toBe(200);
    return RoomResponse.parse(response.payload).room!;
  }
  socket(cookie = this.header()) {
    const socket: Client = clientIo(origin, {
      autoConnect: false, forceNew: true, reconnection: false, transports: ["websocket"], extraHeaders: { Cookie: cookie },
    });
    clients.push(socket);
    return socket;
  }
}

function snapshot(socket: Client, predicate: (value: RoomResponse) => boolean): Promise<RoomResponse> {
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timeout); socket.off("room:snapshot", receive); cancelWaiters.delete(done); };
    const receive = (value: RoomResponse) => {
      const parsed = RoomResponse.parse(value);
      if (!predicate(parsed)) return;
      done(); resolve(parsed);
    };
    const timeout = setTimeout(() => { done(); reject(new Error("Snapshot event timed out")); }, 4000);
    cancelWaiters.add(done);
    socket.on("room:snapshot", receive);
  });
}
async function connect(player: Player) {
  const socket = player.socket();
  const first = snapshot(socket, () => true);
  socket.connect();
  await first;
  return socket;
}
function authError(socket: Client): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Auth error timed out")), 4000);
    cancelWaiters.add(() => clearTimeout(timeout));
    socket.once("connect_error", (error) => { clearTimeout(timeout); resolve(error.message); });
    socket.connect();
  });
}

async function start(accessTtlSeconds?: number) {
  t = await testApp({ session: { accessTtlSeconds } });
  io = new Server(t.app.server);
  drain = registerSockets(io, t.app.rooms, t.redis, { verifyKeys: t.app.sessions.verifyKeys, logger: t.app.log });
  origin = await t.app.listen({ host: "127.0.0.1", port: 0 });
}

afterEach(async () => {
  for (const cancel of cancelWaiters) cancel();
  clients.forEach((socket) => socket.disconnect());
  await io?.close();
  await drain?.();
  if (t) {
    for (const key of keys) {
      if (!key.startsWith("refresh:")) continue;
      const raw = await t.redis.get(key);
      if (raw) keys.add(`refresh-family:${JSON.parse(raw).familyId}`);
    }
    if (keys.size) await t.redis.del(...keys);
    await t.close();
  }
  vi.useRealTimers();
  keys.clear(); clients.length = 0; players.length = 0; cancelWaiters.clear();
});

describe("Slice 1 real HTTP and socket lobby", () => {
  it("rules 1.1, 1.11-1.15: full lobby, disconnect, reconnect, leave and closed-room rejection", async () => {
    await start();
    const a = new Player(), b = new Player(), outsider = new Player();
    const room = await a.room("/api/rooms", "POST", { name: "Ann", topic: "Should lectures be optional?" });
    await b.room("/api/rooms/join", "POST", { name: "Bo", code: room.code });
    const sa = await connect(a), sb = await connect(b);
    await a.room(`/api/rooms/${room.roomId}/position`, "PUT", { text: "Lectures should be optional." });
    await b.room(`/api/rooms/${room.roomId}/position`, "PUT", { text: "Attendance supports participation." });
    const bothA = snapshot(sa, (value) => value.room?.bothReady === true);
    const bothB = snapshot(sb, (value) => value.room?.bothReady === true);
    await a.room(`/api/rooms/${room.roomId}/ready`, "PUT", { ready: true });
    await b.room(`/api/rooms/${room.roomId}/ready`, "PUT", { ready: true });
    const planned = (await bothA).room!;
    expect(planned.you.slot).toBe("A");
    expect(planned.setup.phase).toBe("planning");
    expect(planned.setup.positions).toEqual({ A: "Lectures should be optional.", B: "Attendance supports participation." });
    expect((await bothB).room!.you.slot).toBe("B");
    const offline = snapshot(sa, (value) => value.room?.players[1]?.connected === false && value.room.bothReady === false);
    sb.disconnect();
    await offline;
    const restored = snapshot(sa, (value) => value.room?.bothReady === true);
    const back = await connect(b);
    await restored;
    const remaining = snapshot(sa, (value) => value.room?.players[1]?.left === true);
    const departed = snapshot(back, (value) => value.room === null);
    await b.request(`/api/rooms/${room.roomId}/leave`, "POST");
    expect((await remaining).room!.closed).toBe(true);
    expect(await departed).toEqual({ room: null });
    const denied = await outsider.request("/api/rooms/join", "POST", { name: "Cy", code: room.code });
    expect(denied).toMatchObject({ status: 409, payload: { error: { code: "ROOM_CLOSED" } } });
  });

  it("rule 1.1: socket survives token expiry; HTTP and reconnect recover only after refresh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await start(1);
    const a = new Player();
    const room = await a.room("/api/rooms", "POST", { name: "Ann", topic: "Should lectures be optional?" });
    await new Player().room("/api/rooms/join", "POST", { name: "Bo", code: room.code });
    await a.room(`/api/rooms/${room.roomId}/position`, "PUT", { text: "My position" });
    const socket = await connect(a);
    const oldCookies = a.header();
    vi.setSystemTime(Date.now() + 2000);
    expect(socket.connected).toBe(true);
    const response = await a.request(`/api/rooms/${room.roomId}/ready`, "PUT", { ready: true });
    expect(response).toMatchObject({ status: 401, payload: { error: { code: "SESSION_EXPIRED" } } });
    expect(await authError(a.socket(oldCookies))).toBe("SESSION_EXPIRED");
    expect((await a.request("/api/session/refresh", "POST")).status).toBe(204);
    const pushed = snapshot(socket, (value) => value.room?.players[0]?.ready === true);
    await a.room(`/api/rooms/${room.roomId}/ready`, "PUT", { ready: true });
    await pushed;
    await connect(a);
    expect(socket.connected).toBe(true);
    expect(await authError(a.socket(oldCookies))).toBe("SESSION_EXPIRED");
  });

  it("rules 1.13, 1.17: two tabs receive identical updates for the same player", async () => {
    await start();
    const a = new Player();
    const room = await a.room("/api/rooms", "POST", { name: "Ann", topic: "Should lectures be optional?" });
    await new Player().room("/api/rooms/join", "POST", { name: "Bo", code: room.code });
    await a.room(`/api/rooms/${room.roomId}/position`, "PUT", { text: "My position" });
    const first = await connect(a), second = await connect(a);
    const updates = [first, second].map((socket) => snapshot(socket, (value) => value.room?.players[0]?.ready === true));
    await a.room(`/api/rooms/${room.roomId}/ready`, "PUT", { ready: true });
    const [one, two] = await Promise.all(updates);
    expect(one).toEqual(two);
    expect(JSON.stringify(one)).not.toMatch(/"p_[A-Za-z0-9_-]{22}"/);
  });
});
