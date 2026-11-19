import { randomBytes } from "node:crypto";
import { Job, Worker } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "socket.io";
import { io as clientIo, type Socket } from "socket.io-client";
import { DebatePlan, RoomResponse, type ClientToServerEvents, type ServerToClientEvents } from "@quarrel/shared/contract";
import { loadAiConfig } from "../common/config";
import { newPlayerId, signAccessToken, secretKey } from "../common/tokens";
import { createQueueRedis } from "../common/redis";
import { RoomRepo } from "../rooms/room-repo";
import { createPlanQueue, enqueuePlan, type PlanJobData } from "../rooms/plan-queue";
import { subscribeRoomEvents, ROOM_EVENTS_CHANNEL } from "../rooms/room-pubsub";
import { createPlanProcessor } from "../worker/plan-worker";
import { generateLawyerResult } from "../worker/ai/judge-engine";
import { registerSockets, type GameServer } from "../api/sockets";
import { connectedRedis, REDIS_URL, TEST_SECRET, testApp, type TestApp } from "./helpers";

type Player = { id: string; cookies: { quarrel_access: string } };
type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let t: TestApp;
let producer: Awaited<ReturnType<typeof connectedRedis>>;
let queue: ReturnType<typeof createPlanQueue>;
let repo: RoomRepo;
let worker: Worker | undefined;
let workerRedis: ReturnType<typeof createQueueRedis> | undefined;
let io: GameServer | undefined;
let drain: (() => Promise<void>) | undefined;
let stopSubscriber: (() => Promise<void>) | undefined;
let ensure: ReturnType<typeof vi.fn<(roomId: string) => Promise<void>>>;
const keys = new Set<string>();
const clients: Client[] = [];
const cancellations: (() => void)[] = [];
const demo = loadAiConfig({ JUDGE_AI_MODE: "demo" });
const ai = loadAiConfig({ JUDGE_AI_MODE: "auto", GEMINI_API_KEY: "test-only-not-a-real-key" });

beforeEach(async () => {
  producer = await connectedRedis();
  queue = createPlanQueue(producer, `s3-tests-${randomBytes(8).toString("hex")}`);
  ensure = vi.fn((roomId: string) => enqueuePlan(queue, roomId));
  t = await testApp({ rooms: { ensurePlan: ensure } });
  repo = new RoomRepo(t.redis);
});
afterEach(async () => {
  cancellations.splice(0).forEach((cancel) => cancel());
  clients.splice(0).forEach((socket) => socket.disconnect());
  await io?.close(); await drain?.(); await stopSubscriber?.();
  await worker?.close(); workerRedis?.disconnect();
  await queue.obliterate({ force: true }); await queue.close(); producer.disconnect();
  const rooms = [...keys].filter((key) => /^room:r_[A-Za-z0-9_-]+$/.test(key));
  if (rooms.length) await t.redis.zrem("deadlines", ...rooms.map((key) => key.slice(5)));
  for (const key of rooms) { keys.add(`${key}:messages`); keys.add(`${key}:requests`); }
  if (keys.size) await t.redis.del(...keys);
  await t.close(); keys.clear();
  worker = undefined; workerRedis = undefined; io = undefined; drain = undefined; stopSubscriber = undefined;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function player(): Promise<Player> {
  const id = newPlayerId(); keys.add(`player:${id}`); keys.add(`presence:${id}`);
  return { id, cookies: { quarrel_access: await signAccessToken(id, secretKey(TEST_SECRET)) } };
}
const post = (who: Player, path: string, payload?: Record<string, unknown>) => t.app.inject({ method: "POST", url: path, cookies: who.cookies, ...(payload === undefined ? {} : { payload }) });
const put = (who: Player, path: string, payload: Record<string, unknown>) => t.app.inject({ method: "PUT", url: path, cookies: who.cookies, payload });
function room(response: Awaited<ReturnType<typeof post>>) {
  expect(response.statusCode, response.body).toBe(200);
  const value = RoomResponse.parse(response.json()).room!;
  keys.add(`room:${value.roomId}`); keys.add(`code:${value.code}`); return value;
}
async function pair(planning = true) {
  const a = await player(), b = await player();
  const created = room(await post(a, "/api/rooms", { name: "Ann", topic: "Should lectures be optional?" }));
  room(await post(b, "/api/rooms/join", { name: "Bo", code: created.code }));
  if (planning) {
    room(await put(a, `/api/rooms/${created.roomId}/position`, { text: "Allow flexible study." }));
    room(await put(b, `/api/rooms/${created.roomId}/position`, { text: "Attendance supports learning." }));
    room(await put(a, `/api/rooms/${created.roomId}/ready`, { ready: true }));
    room(await put(b, `/api/rooms/${created.roomId}/ready`, { ready: true }));
  }
  return { a, b, roomId: created.roomId };
}
const plan = (): DebatePlan => ({ source: "demo", text: "Two balanced questions.", subtopics: [
  { ordinal: 1, question: "What supports each position?", secondsPerPlayer: 120, openerSlot: "A" },
  { ordinal: 2, question: "What trade-offs should be considered?", secondsPerPlayer: 120, openerSlot: "B" },
] });
const job = (roomId: string) => new Job<PlanJobData>(queue, "plan", { roomId }, { attempts: 3 }, `plan-${roomId}`);
async function connected(a: Player, b: Player) {
  await t.redis.set(`presence:${a.id}`, "1", "EX", 35); await t.redis.set(`presence:${b.id}`, "1", "EX", 35);
}
const start = (who: Player, roomId: string) => post(who, `/api/rooms/${roomId}/start`);
const expectError = (response: Awaited<ReturnType<typeof post>>, status: number, code: string) => {
  expect(response.statusCode, response.body).toBe(status); expect(response.json().error.code).toBe(code);
};
const attempt = (roomId: string, attemptsMade: number) => Object.assign(job(roomId), { attemptsMade });

describe("S3 saved plan and Start", () => {
  it("rule S3.1: save-plan writes once in planning and increments version once", async () => {
    const { a, roomId } = await pair();
    expect(await repo.savePlan(roomId, plan())).toMatchObject({ status: "OK", changed: true });
    expect(await repo.savePlan(roomId, { ...plan(), text: "Late replacement" })).toMatchObject({ changed: false });
    const current = (await t.app.rooms.current(a.id)).room!;
    expect(current.version).toBe(7); expect(current.plan).toEqual(plan()); expect(current.startsAt).toBeNull();
  });
  it.each(["waiting", "positions", "debate", "closed", "expired", "missing"])("rule S3.1: save-plan ignores %s rooms", async (state) => {
    const { roomId } = await pair();
    if (state === "closed") await t.redis.hset(`room:${roomId}`, "closed", "1");
    else if (state === "expired") await t.redis.hset(`room:${roomId}`, "expiresAt", "0");
    else if (state === "missing") await t.redis.del(`room:${roomId}`);
    else await t.redis.hset(`room:${roomId}`, "phase", state);
    const before = await repo.readRoom(roomId);
    expect(await repo.savePlan(roomId, plan())).toMatchObject({ changed: false });
    expect(await repo.readRoom(roomId)).toEqual(before);
  });
  it("rule S3.1: invalid shape or wrong total cannot be saved", async () => {
    const { roomId } = await pair();
    await expect(repo.savePlan(roomId, { ...plan(), source: "untrusted" } as never)).rejects.toBeInstanceOf(Error);
    const wrong = plan(); wrong.subtopics[0]!.secondsPerPlayer = 60;
    expect(await repo.savePlan(roomId, wrong)).toMatchObject({ status: "INTERNAL" });
    expect((await repo.readRoom(roomId)).plan).toBeUndefined();
  });
  it("rule S3.2: only the host starts, in planning with a plan and both live presence keys", async () => {
    const { a, b, roomId } = await pair(false);
    expectError(await start(b, roomId), 403, "FORBIDDEN");
    expectError(await start(a, roomId), 409, "WRONG_PHASE");
    await put(a, `/api/rooms/${roomId}/position`, { text: "A view" }); await put(b, `/api/rooms/${roomId}/position`, { text: "B view" });
    await put(a, `/api/rooms/${roomId}/ready`, { ready: true }); await put(b, `/api/rooms/${roomId}/ready`, { ready: true });
    expectError(await start(a, roomId), 409, "PLAN_NOT_READY");
    await repo.savePlan(roomId, plan());
    expectError(await start(a, roomId), 409, "PLAYER_NOT_CONNECTED");
    await t.redis.set(`presence:${a.id}`, "1", "EX", 35);
    expectError(await start(a, roomId), 409, "PLAYER_NOT_CONNECTED");
    await t.redis.set(`presence:${b.id}`, "1", "EX", 35);
    const events = vi.fn(); t.app.rooms.events.on("roomChanged", events);
    const time = await t.redis.time(); const before = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
    const started = room(await start(a, roomId));
    expect(started.setup.phase).toBe("debate"); expect(started.version).toBe(8);
    expect(Date.parse(started.startsAt!) - before).toBeGreaterThanOrEqual(3000);
    expect(Date.parse(started.startsAt!) - Date.parse(started.serverNow)).toBeGreaterThan(2500);
    expect(Date.parse(started.startsAt!) - Date.parse(started.serverNow)).toBeLessThanOrEqual(3000);
    expect(events).toHaveBeenCalledTimes(1);
    expectError(await start(a, roomId), 409, "WRONG_PHASE"); expect(events).toHaveBeenCalledTimes(1);
  });
  it("rule S3.2: outsider, stale tab, expired and closed-room checks remain authoritative", async () => {
    const { a, b, roomId } = await pair();
    expectError(await post(await player(), `/api/rooms/${roomId}/start`), 404, "ROOM_NOT_FOUND");
    expectError(await t.app.inject({ method: "POST", url: `/api/rooms/${roomId}/start` }), 401, "UNAUTHENTICATED");
    expectError(await start(a, "r_AAAAAAAAAAAAAAAAAAAAAA"), 409, "STALE_ROOM");
    await repo.savePlan(roomId, plan()); await connected(a, b);
    await post(b, `/api/rooms/${roomId}/leave`);
    expectError(await start(a, roomId), 409, "ROOM_CLOSED");
    await t.redis.hset(`room:${roomId}`, "expiresAt", "0");
    expectError(await start(a, roomId), 410, "ROOM_EXPIRED");
  });
  it("rule S3.2: Lua rechecks presence after Node's key discovery", async () => {
    const { a, b, roomId } = await pair(); await repo.savePlan(roomId, plan()); await connected(a, b);
    const original = t.redis.hgetall.bind(t.redis);
    vi.spyOn(t.redis, "hgetall").mockImplementationOnce(async (key) => {
      const value = await original(key); await t.redis.del(`presence:${b.id}`); return value;
    });
    expectError(await start(a, roomId), 409, "PLAYER_NOT_CONNECTED");
    expect((await repo.readRoom(roomId)).startsAt).toBeUndefined();
  });
});

describe("S3 queue and worker", () => {
  it("rule S3.3: planning enqueues once, stable IDs dedupe, and reads recover a missing job", async () => {
    const { a, roomId } = await pair();
    expect(ensure).toHaveBeenCalledTimes(1);
    const first = (await queue.getJob(`plan-${roomId}`))!;
    expect(first.opts).toMatchObject({ attempts: 3, backoff: { type: "exponential", delay: 1000 } });
    await enqueuePlan(queue, roomId); await enqueuePlan(queue, roomId);
    expect(await queue.getJobCounts("wait")).toMatchObject({ wait: 1 });
    await expect(queue.add("plan", { roomId }, { jobId: `plan:${roomId}` })).rejects.toThrow("Custom Id cannot contain :");
    await first.remove();
    await t.app.rooms.current(a.id, false); expect(await queue.getJob(`plan-${roomId}`)).toBeUndefined();
    room(await t.app.inject({ method: "GET", url: "/api/session", cookies: a.cookies }));
    expect(await queue.getJob(`plan-${roomId}`)).toBeDefined();
  });
  it("rule S3.3: a post-Lua queue failure leaves planning recoverable by the next read", async () => {
    const { a, b, roomId } = await pair(false);
    await put(a, `/api/rooms/${roomId}/position`, { text: "A view" }); await put(b, `/api/rooms/${roomId}/position`, { text: "B view" });
    await put(a, `/api/rooms/${roomId}/ready`, { ready: true });
    ensure.mockRejectedValueOnce(new Error("queue unavailable"));
    expect((await put(b, `/api/rooms/${roomId}/ready`, { ready: true })).statusCode).toBe(500);
    expect((await repo.readRoom(roomId)).phase).toBe("planning");
    await t.app.rooms.current(a.id); expect(await queue.getJob(`plan-${roomId}`)).toBeDefined();
  });
  it.each([demo, loadAiConfig({ JUDGE_AI_MODE: "auto" })])("rule S3.4: AI off or unconfigured saves a labelled two-subtopic demo", async (config) => {
    const { a, roomId } = await pair(); const generate = vi.fn<typeof generateLawyerResult>();
    await createPlanProcessor(t.redis, config, generate)(job(roomId));
    const saved = (await t.app.rooms.current(a.id)).room!.plan!;
    expect(saved.source).toBe("demo"); expect(saved.subtopics).toHaveLength(2);
    expect(saved.subtopics.map((item) => item.openerSlot)).toEqual(["A", "B"]);
    expect(saved.subtopics.map((item) => item.secondsPerPlayer)).toEqual([120, 120]);
    expect(generate).not.toHaveBeenCalled();
  });
  it("rule S3.4: fake AI success is validated, given alternating openers, and saved", async () => {
    const { a, roomId } = await pair();
    const generate = vi.fn<typeof generateLawyerResult>().mockResolvedValue({ kind: "plan", source: "ai", text: "Balanced plan.", subtopics:
      [1, 2, 3, 4].map((ordinal) => ({ ordinal, question: `What about criterion ${ordinal}?`, secondsPerPlayer: 60 })) });
    await createPlanProcessor(t.redis, ai, generate)(job(roomId));
    const saved = (await t.app.rooms.current(a.id)).room!.plan!;
    expect(saved.source).toBe("ai"); expect(saved.subtopics.map((item) => item.openerSlot)).toEqual(["A", "B", "A", "B"]);
    expect(generate.mock.calls[0]![0].context.players.map((item) => item.position)).toEqual(["Allow flexible study.", "Attendance supports learning."]);
    expect(generate.mock.calls[0]![2]).toBe(true);
  });
  it.each(["exception", "shape", "total", "fallback"])("rule S3.4: %s failures retry without a plan, and only final failure saves fallback", async (failure) => {
    const { a, roomId } = await pair();
    const generate = vi.fn<typeof generateLawyerResult>();
    if (failure === "exception") generate.mockRejectedValue(new Error("provider-private-details"));
    else if (failure === "shape") generate.mockResolvedValue({ kind: "plan", source: "ai", text: "Bad plan", subtopics: [] });
    else generate.mockResolvedValue({ kind: "plan", source: failure === "fallback" ? "fallback" : "ai", text: "Plan", subtopics: [
      { ordinal: 1, question: "First?", secondsPerPlayer: failure === "fallback" ? 120 : 30 }, { ordinal: 2, question: "Second?", secondsPerPlayer: failure === "fallback" ? 120 : 30 },
    ] });
    const process = createPlanProcessor(t.redis, ai, generate);
    for (const attemptNumber of [0, 1]) {
      await expect(process(attempt(roomId, attemptNumber))).rejects.toThrow("PLAN_GENERATION_FAILED");
      expect((await repo.readRoom(roomId)).plan).toBeUndefined();
    }
    await process(attempt(roomId, 2));
    const saved = (await t.app.rooms.current(a.id)).room!.plan!;
    expect(saved.source).toBe("fallback"); expect(saved.subtopics).toHaveLength(2);
    expect(saved.subtopics.reduce((sum, item) => sum + item.secondsPerPlayer, 0)).toBe(240);
  });
  it("rule S3.4: missing/closed/expired/wrong-phase jobs are ignored and saved-plan retries re-publish", async () => {
    const { roomId } = await pair(); const process = createPlanProcessor(t.redis, demo);
    await expect(process(Object.assign(job(roomId), { name: "unknown" }))).rejects.toThrow("UNKNOWN_JOB");
    await process(job("r_AAAAAAAAAAAAAAAAAAAAAA"));
    await repo.savePlan(roomId, plan()); const publish = vi.spyOn(t.redis, "publish");
    await process(job(roomId)); expect(publish).toHaveBeenCalledWith(ROOM_EVENTS_CHANNEL, roomId);
    await t.redis.hset(`room:${roomId}`, "closed", "1"); publish.mockClear();
    await process(job(roomId)); expect(publish).not.toHaveBeenCalled();
    await t.redis.hset(`room:${roomId}`, "closed", "0", "expiresAt", "0");
    await process(job(roomId)); expect(publish).not.toHaveBeenCalled();
  });
  it("rule S3.4: persistence failures fail the job rather than silently completing", async () => {
    const { roomId } = await pair();
    vi.spyOn(RoomRepo.prototype, "savePlan").mockResolvedValueOnce({ status: "INTERNAL" });
    await expect(createPlanProcessor(t.redis, demo)(job(roomId))).rejects.toThrow("PLAN_SAVE_FAILED");
  });
  it("rule S3.4: a plan that finishes after leave cannot save or publish", async () => {
    const { b, roomId } = await pair();
    const generate = vi.fn<typeof generateLawyerResult>().mockImplementation(async () => {
      await post(b, `/api/rooms/${roomId}/leave`);
      const { source: _source, subtopics, ...output } = plan();
      return { kind: "plan", source: "ai", ...output, subtopics: subtopics.map(({ openerSlot: _opener, ...item }) => item) };
    });
    const publish = vi.spyOn(t.redis, "publish");
    await createPlanProcessor(t.redis, ai, generate)(job(roomId));
    expect((await repo.readRoom(roomId)).plan).toBeUndefined(); expect(publish).not.toHaveBeenCalled();
  });
});

describe("S3 live worker/pubsub integration", () => {
  it("rule S3.5: subscriber setup and shutdown failures always release their connection", async () => {
    const closed = await connectedRedis(); closed.disconnect();
    await expect(subscribeRoomEvents(closed, t.app.rooms, t.app.log)).rejects.toThrow("Redis subscriber unavailable");
    const failed = await connectedRedis();
    const disconnect = vi.spyOn(failed, "disconnect");
    vi.spyOn(failed, "subscribe").mockRejectedValueOnce(new Error("subscribe failed"));
    await expect(subscribeRoomEvents(failed, t.app.rooms, t.app.log)).rejects.toThrow("subscribe failed");
    expect(disconnect).toHaveBeenCalled(); expect(failed.listenerCount("message")).toBe(0);
    const subscriber = await connectedRedis();
    const stop = await subscribeRoomEvents(subscriber, t.app.rooms, t.app.log);
    const close = vi.spyOn(subscriber, "disconnect");
    vi.spyOn(subscriber, "unsubscribe").mockRejectedValueOnce(new Error("unsubscribe failed"));
    await expect(stop()).rejects.toThrow("unsubscribe failed"); expect(close).toHaveBeenCalled();
  });
  it("rule S3.5: a real queued demo plan appears in both players' socket views, then Start pushes the same countdown", async () => {
    const { a, b, roomId } = await pair();
    io = new Server(t.app.server);
    drain = registerSockets(io, t.app.rooms, t.redis, { verifyKeys: t.app.sessions.verifyKeys, logger: t.app.log });
    stopSubscriber = await subscribeRoomEvents(await connectedRedis(), t.app.rooms, t.app.log);
    const url = await t.app.listen({ host: "127.0.0.1", port: 0 });
    function next(socket: Client, predicate: (value: RoomResponse) => boolean): Promise<RoomResponse> {
      return new Promise((resolve, reject) => {
        const receive = (value: RoomResponse) => { if (predicate(value)) { cancel(); resolve(RoomResponse.parse(value)); } };
        const cancel = () => { clearTimeout(timeout); socket.off("room:snapshot", receive); };
        const timeout = setTimeout(() => { cancel(); reject(new Error("S3 socket event timed out")); }, 4000);
        cancellations.push(cancel); socket.on("room:snapshot", receive);
      });
    }
    async function connect(who: Player) {
      const socket: Client = clientIo(url, { autoConnect: false, forceNew: true, reconnection: false, transports: ["websocket"], extraHeaders: { Cookie: `quarrel_access=${who.cookies.quarrel_access}` } });
      clients.push(socket); const initial = next(socket, () => true); socket.connect(); await initial; return socket;
    }
    const sa = await connect(a), sb = await connect(b);
    const plans = [sa, sb].map((socket) => next(socket, (value) => Boolean(value.room?.plan)));
    workerRedis = createQueueRedis(REDIS_URL);
    worker = new Worker(queue.name, createPlanProcessor(workerRedis, demo), { connection: workerRedis });
    const completed = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Worker completion timed out")), 4000);
      cancellations.push(() => clearTimeout(timeout));
      worker!.once("completed", () => { clearTimeout(timeout); resolve(); });
    });
    await worker.waitUntilReady();
    const [aPlan, bPlan] = await Promise.all(plans);
    expect(aPlan!.room!.you.slot).toBe("A"); expect(bPlan!.room!.you.slot).toBe("B");
    expect(aPlan!.room!.plan).toEqual(bPlan!.room!.plan);
    const starts = [sa, sb].map((socket) => next(socket, (value) => value.room?.setup.phase === "debate"));
    room(await start(a, roomId));
    const [aStart, bStart] = await Promise.all(starts);
    expect(aStart!.room!.startsAt).toBe(bStart!.room!.startsAt);
    await completed;
    expect(await queue.getJob(`plan-${roomId}`)).toBeDefined();
    await enqueuePlan(queue, roomId);
    expect(await queue.getJobCounts("completed", "wait", "active")).toMatchObject({ completed: 1, wait: 0, active: 0 });
    const skipped = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Invalid pubsub event was not handled")), 4000);
      cancellations.push(() => clearTimeout(timeout));
      vi.spyOn(t.app.log, "debug").mockImplementation(() => { clearTimeout(timeout); resolve(); });
    });
    await t.redis.publish(ROOM_EVENTS_CHANNEL, "not-a-room"); await skipped;
  });
});
