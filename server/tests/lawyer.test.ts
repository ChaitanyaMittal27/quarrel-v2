import { randomBytes, randomUUID } from "node:crypto";
import { Job, Worker } from "bullmq";
import { Server } from 'socket.io';
import { io as clientIo, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomResponse, type SubmitMessageRequest, type ClientToServerEvents, type ServerToClientEvents } from "@quarrel/shared/contract";
import { getTheme, resolveLawyer } from "@quarrel/shared/config";
import { RoomRepo } from "../rooms/room-repo";
import { createPlanQueue, enqueueLawyer, type LawyerJobData, enqueueJudge, type JudgeJobData, type EnsureJudge } from "../rooms/plan-queue";
import { createQueueRedis } from "../common/redis";
import { loadAiConfig } from "../common/config";
import { createJudgeProcessor } from "../worker/judge-worker";
import { createLawyerProcessor, lawyerRequest } from "../worker/lawyer-worker";
import { lawyerContext, lawyerInstructions } from "../worker/ai/lawyer-policy";
import { createDeadlineTick, startDeadlineLoop } from "../worker/clock-worker";
import { ROOM_EVENTS_CHANNEL } from "../rooms/room-pubsub";
import { subscribeRoomEvents } from '../rooms/room-pubsub';
import { registerSockets } from '../api/sockets';
import { newPlayerId, secretKey, signAccessToken } from "../common/tokens";
import { connectedRedis, REDIS_URL, TEST_SECRET, testApp, type TestApp } from "./helpers";

type Player = { id: string; cookies: { quarrel_access: string } };
let t: TestApp, repo: RoomRepo, now: number, roomId: string, deadlinesKey: string, a: Player, b: Player;
let queue: ReturnType<typeof createPlanQueue> | undefined, worker: Worker | undefined, connection: ReturnType<typeof createQueueRedis> | undefined;
const keys = new Set<string>();
const ensure = vi.fn<(roomId: string, workId: string) => Promise<void>>();
const ensureJudge = vi.fn<EnsureJudge>();
const demo = loadAiConfig({ JUDGE_AI_MODE: "demo" });
const ai = loadAiConfig({ JUDGE_AI_MODE: "auto", GEMINI_API_KEY: "fake-test-key" });
beforeEach(async () => {
  const redis = await connectedRedis(); const time = await redis.time(); redis.disconnect();
  now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  deadlinesKey = `deadlines:s6-${randomBytes(8).toString('hex')}`; keys.add(deadlinesKey);
  ensure.mockReset().mockResolvedValue();
  ensureJudge.mockReset().mockResolvedValue();
  t = await testApp({ rooms: { now: () => now, deadlinesKey, ensureLawyer: ensure, ensureJudge } });
  repo = new RoomRepo(t.redis, { now: () => now, deadlinesKey });
  const player = async (): Promise<Player> => {
    const id = newPlayerId(); keys.add(`player:${id}`); keys.add(`presence:${id}`);
    return { id, cookies: { quarrel_access: await signAccessToken(id, secretKey(TEST_SECRET)) } };
  };
  a = await player(); b = await player();
  const room = view(await post(a, '/api/rooms', { name: 'Ann', topic: 'Should we plant gardens?', durationSec: 120 }));
  roomId = room.roomId;
  keys.add(`room:${roomId}`); keys.add(`code:${room.code}`); keys.add(`room:${roomId}:messages`); keys.add(`room:${roomId}:requests`);
  view(await post(b, '/api/rooms/join', { name: 'Bo', code: room.code }));
  for (const who of [a, b]) {
    await t.app.inject({ method: 'PUT', url: `/api/rooms/${roomId}/position`, cookies: who.cookies, payload: { text: 'Consider the costs and benefits.' } });
    await t.app.inject({ method: 'PUT', url: `/api/rooms/${roomId}/ready`, cookies: who.cookies, payload: { ready: true } });
    await repo.refreshPresence(who.id);
  }
  await repo.savePlan(roomId, { source: 'demo', text: 'Plan', subtopics: [
    { ordinal: 1, question: 'Benefits?', secondsPerPlayer: 60, openerSlot: 'A' },
    { ordinal: 2, question: 'Costs?', secondsPerPlayer: 60, openerSlot: 'B' },
  ] });
  view(await post(a, `/api/rooms/${roomId}/start`)); now += 3000;
});
afterEach(async () => {
  vi.useRealTimers(); await worker?.close(); connection?.disconnect();
  await queue?.obliterate({ force: true }); await queue?.close();
  worker = undefined; connection = undefined; queue = undefined;
  const archivedId = (await repo.readRoom(roomId)).debateId;
  if (archivedId) { await t.redis.hdel('pending-archives',archivedId); await t.redis.del(`archive:${archivedId}`); }
  if (keys.size) await t.redis.del(...keys); keys.clear(); await t.close(); vi.restoreAllMocks();
});
const post = (who: Player, url: string, payload?: Record<string, unknown>) => t.app.inject({ method: 'POST', url, cookies: who.cookies, ...(payload === undefined ? {} : { payload }) });
function view(response: Awaited<ReturnType<typeof post>>) {
  expect(response.statusCode, response.body).toBe(200); return RoomResponse.parse(response.json()).room!;
}
const current = async (who = a) => (await t.app.rooms.current(who.id)).room!;
const submit = (kind: SubmitMessageRequest['kind'] = 'argument', who = a, text = 'Gardens could help us share space.', requestKey = randomUUID(), ordinal = 1) =>
  post(who, `/api/rooms/${roomId}/messages`, { kind, ordinal, text, requestKey });
async function finish(text = 'Gardens help us share space.', source: 'ai' | 'demo' | 'fallback' = 'ai') {
  const fields = await repo.readRoom(roomId); return repo.finishLawyer(roomId, fields.workId!, text, source);
}
async function process(config = demo, generate?: Parameters<typeof createLawyerProcessor>[2]) {
  const fields = await repo.readRoom(roomId);
  await createLawyerProcessor(t.redis, config, generate, { now: () => now, deadlinesKey })({ name: 'lawyer', data: { roomId, workId: fields.workId } } as Job<LawyerJobData>);
}

describe('Stage 6 atomic pause, completion and privacy', () => {
  it('dead-worker integration: an API-side deadline backstop pushes fallback without reads or a running AI worker', async () => {
    const io = new Server<ClientToServerEvents, ServerToClientEvents>(t.app.server);
    const drain = registerSockets(io, t.app.rooms, t.redis, { verifyKeys: t.app.sessions.verifyKeys, logger: t.app.log });
    const subscriber = await connectedRedis(), stopEvents = await subscribeRoomEvents(subscriber, t.app.rooms, t.app.log);
    const origin = await t.app.listen({ host: '127.0.0.1', port: 0 });
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = clientIo(origin, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], extraHeaders: { Cookie: `quarrel_access=${a.cookies.quarrel_access}` } });
    const cancel: (() => void)[] = [];
    const wait = (predicate: (r: NonNullable<RoomResponse['room']>) => boolean) => new Promise<NonNullable<RoomResponse['room']>>((resolve, reject) => {
      const done = () => { clearTimeout(timer); socket.off('room:snapshot', receive) };
      const receive = (body: RoomResponse) => { const room = RoomResponse.parse(body).room; if (room && predicate(room)) { done(); resolve(room) } };
      const timer = setTimeout(() => { done(); reject(new Error('Backstop push timed out')) }, 4000);
      cancel.push(done); socket.on('room:snapshot', receive);
    });
    let stop: (() => Promise<void>) | undefined;
    try {
      const initial = wait(() => true); socket.connect(); await initial;
      const time = await t.redis.time(); now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
      await t.redis.hset(`room:${roomId}`, 'startsAt', now - 1, 'deadline', now + 60000);
      view(await submit('argument', a, 'Unchanged work fallback.'));
      const completed = wait((room) => room.messages.some((message) => message.kind === 'argument' && message.source === 'fallback'));
      const deadline = now + 100;
      await t.redis.hset(`room:${roomId}`, 'workDeadline', deadline); await t.redis.zadd(deadlinesKey, deadline, roomId);
      // No BullMQ Worker and no more HTTP/session reads: this is the API's independent loop.
      stop = startDeadlineLoop(createDeadlineTick(t.redis, { error: vi.fn() }, { deadlinesKey }), { error: vi.fn() }, 10);
      const result = await completed;
      expect(result.messages.at(-1)).toMatchObject({ text: 'Unchanged work fallback.', source: 'fallback' });
      expect(result.debate!.activeSlot).toBe('B');
    } finally {
      cancel.forEach((done) => done()); await stop?.(); socket.disconnect(); await io.close(); await drain(); await stopEvents();
    }
  });
  it('existing composing rooms and previously public raw arguments remain readable after the contract upgrade', async () => {
    await t.redis.hdel(`room:${roomId}`, 'state');
    await t.redis.rpush(`room:${roomId}:messages`, JSON.stringify({ id: 'm_old', ordinal: 1, kind: 'argument', slot: 'A', text: 'An already public old argument.', at: now }));
    const room = await current(); expect(room.debate!.state).toBe('composing');
    expect(room.messages[1]!.source).toBe('fallback');
    expect(view(await submit()).debate!.state).toBe('lawyering');
  });
  it('rule 4.3: charging never exceeds the stored allowance', async () => {
    await t.redis.hset(`room:${roomId}`, 'a.remainingMs', 1000);
    expect(view(await submit()).debate!.clocks.A).toBe(1000);
  });
  it.each(['argument', 'consult'] as const)('rules 4.1,4.3,5.6-5.9: %s pauses both clocks and exposes only owner records', async (kind) => {
    now += 1500;
    const raw = '  PRIVATE original\ntext  ';
    const owner = view(await submit(kind, a, raw)); const peer = await current(b);
    expect(owner.debate).toMatchObject({ state: kind === 'consult' ? 'consulting' : 'lawyering', activeSlot: null, deadline: null, clocks: { A: 58500, B: 60000 } });
    expect(peer.debate).toMatchObject({ state: 'lawyering', activeSlot: null, deadline: null, consultsLeft: 2, drafts: [], consultations: [] });
    const fields = await repo.readRoom(roomId);
    expect(fields.workId).toMatch(/^w_[A-Za-z0-9_-]{22}$/);
    expect(fields).not.toHaveProperty('workSeq');
    expect(JSON.stringify(peer)).not.toContain(raw); expect(JSON.stringify(peer)).not.toContain(fields.workId!);
    expect(owner.messages).toHaveLength(1);
    expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(now + 30000);
    expect(ensure).toHaveBeenCalledWith(roomId, fields.workId);
    now += 12000;
    expect((await current()).debate!.clocks).toEqual({ A: 58500, B: 60000 });
    await finish(kind === 'argument' ? 'A carefully presented point.' : 'Consider what evidence supports your concern.');
    const done = await current(), other = await current(b);
    expect(done.debate).toMatchObject({ state: 'composing', activeSlot: kind === 'argument' ? 'B' : 'A', clocks: { A: 58500, B: 60000 } });
    expect(Date.parse(done.debate!.deadline!) - now).toBe(kind === 'argument' ? 60000 : 58500);
    expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(Date.parse(done.debate!.deadline!));
    if (kind === 'argument') {
      expect(done.debate!.drafts[0]).toMatchObject({ text: raw, status: 'complete' });
      expect(done.messages[1]).toMatchObject({ source: 'ai', slot: 'A', text: 'A carefully presented point.', at: new Date(now).toISOString() });
    } else {
      expect(done.messages).toHaveLength(1); expect(done.debate!.consultsLeft).toBe(1);
      expect(done.debate!.consultations[0]).toMatchObject({ question: raw, answer: 'Consider what evidence supports your concern.' });
      expect(other.debate!.consultations).toEqual([]);
    }
    expect(JSON.stringify(other)).not.toContain(raw); expect(JSON.stringify(other)).not.toContain(fields.workId!);
  });
  it('rule 4.8: replay/kind conflict, phase, ordinal, owner and LAWYER_BUSY have the specified order', async () => {
    const key = randomUUID(); const first = view(await submit('argument', a, 'Original', key));
    const snapshot = await repo.readRoom(roomId);
    expect(view(await submit('argument', a, 'Original', key)).version).toBe(first.version);
    expect((await submit('consult', a, 'Original', key)).json().error.code).toBe('REQUEST_CONFLICT');
    expect((await submit('argument', a, 'Other', randomUUID(), 2)).json().error.code).toBe('STALE_TURN');
    expect((await submit('argument', b)).json().error.code).toBe('NOT_YOUR_TURN');
    expect((await submit()).json().error.code).toBe('LAWYER_BUSY');
    expect(await repo.readRoom(roomId)).toEqual(snapshot);
    await t.redis.hset(`room:${roomId}`, 'phase', 'ended');
    expect((await submit()).json().error.code).toBe('DEBATE_COMPLETE');
    await t.redis.hset(`room:${roomId}`, 'phase', 'planning');
    expect((await submit()).json().error.code).toBe('DEBATE_NOT_STARTED');
  });
  it('rules 4.9-4.10: the consultation cap leaves the deadline and clocks unchanged', async () => {
    for (let index = 0; index < 2; index++) { view(await submit('consult')); now += 5000; await finish('Private answer'); }
    const before = await repo.readRoom(roomId), deadline = await t.redis.zscore(deadlinesKey, roomId);
    const response = await submit('consult'); expect(response.statusCode).toBe(429); expect(response.json().error.code).toBe('LIMIT_REACHED');
    expect(await repo.readRoom(roomId)).toEqual(before); expect(await t.redis.zscore(deadlinesKey, roomId)).toBe(deadline);
    view(await submit()); // Consultation cap does not consume the independent argument cap.
  });
  it('rules 4.4,5.6: finish keeps an exhausted opponent skipped, opens the next subtopic, and ends with drafts retained', async () => {
    view(await submit()); await t.redis.hset(`room:${roomId}`, 'b.remainingMs', 0); await finish();
    expect((await current()).debate!.activeSlot).toBe('A');
    view(await submit()); await t.redis.hset(`room:${roomId}`, 'a.remainingMs', 0, 'b.remainingMs', 0); await finish();
    expect((await current()).setup.phase).toBe('summary');
    let pending = (await repo.catchup(roomId)).judge!;
    await createJudgeProcessor(t.redis, demo, undefined, { now: () => now, deadlinesKey })({ data: { roomId, ...pending } } as Job<JudgeJobData>);
    now += 4000; await repo.catchup(roomId);
    expect((await current()).debate).toMatchObject({ ordinal: 2, activeSlot: 'B', consultsLeft: 2 });
    view(await submit('argument', b, 'Another point', randomUUID(), 2));
    await t.redis.hset(`room:${roomId}`, 'a.remainingMs', 0, 'b.remainingMs', 0); await finish();
    const ended = await current(); expect(ended.setup.phase).toBe('summary'); expect(ended.debate!.drafts).toHaveLength(2);
    expect((await current(b)).debate!.drafts).toHaveLength(1);
    expect(JSON.stringify(await current(b))).not.toContain('Gardens could help us share space.');
    expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(now + 30000);
  });
  it('rule 5.4: read and poller use the same fenced fallback; late AI completion is ignored', async () => {
    const raw = '  Exact original\ntext  '; view(await submit('argument', a, raw));
    const work = (await repo.readRoom(roomId)).workId!; now += 30001;
    const recovered = await current(); expect(recovered.messages[1]).toMatchObject({ text: raw, source: 'fallback' });
    expect(await repo.finishLawyer(roomId, work, 'Late replacement', 'ai')).toMatchObject({ changed: false });
    expect((await current()).messages).toEqual(recovered.messages);
    view(await submit('consult', b)); now += 30001;
    const publish = vi.spyOn(t.redis, 'publish');
    await createDeadlineTick(t.redis, { error: vi.fn() }, { now: () => now, deadlinesKey })();
    expect(publish).toHaveBeenCalledWith(ROOM_EVENTS_CHANNEL, roomId);
    expect((await current(b)).debate!.consultations[0]!.answer).toBe("Your lawyer couldn't answer this time.");
    expect((await current(b)).debate!.activeSlot).toBe('B');
  });
  it('finish rejects stale IDs, closed/expired/missing rooms and gives the work deadline precedence', async () => {
    view(await submit()); const work = (await repo.readRoom(roomId)).workId!;
    expect(await repo.finishLawyer(roomId, 'w_wrong', 'Wrong', 'ai')).toMatchObject({ changed: false });
    await t.redis.hset(`room:${roomId}`, 'phase', 'planning');
    const wrongPhase = await repo.readRoom(roomId);
    expect(await repo.finishLawyer(roomId, work, 'Wrong phase', 'ai')).toMatchObject({ changed: false });
    expect(await repo.readRoom(roomId)).toEqual(wrongPhase);
    await t.redis.hset(`room:${roomId}`, 'phase', 'debate');
    now += 30000;
    expect(await repo.finishLawyer(roomId, work, 'Too late', 'ai')).toMatchObject({ changed: true });
    expect((await current()).messages[1]!.source).toBe('fallback');
    view(await submit('argument', b)); const second = (await repo.readRoom(roomId)).workId!;
    await post(a, `/api/rooms/${roomId}/leave`);
    expect(await repo.finishLawyer(roomId, second, 'Closed', 'ai')).toMatchObject({ changed: false });
    await t.redis.hset(`room:${roomId}`, 'expiresAt', 0);
    expect(await repo.finishLawyer(roomId, second, 'Expired', 'ai')).toMatchObject({ changed: false });
    await t.redis.del(`room:${roomId}`);
    expect(await repo.finishLawyer(roomId, second, 'Missing', 'ai')).toMatchObject({ changed: false });
  });
  it('lost-job reads re-add a stable lawyer job without duplicates; ordinary broadcasts never enqueue', async () => {
    queue = createPlanQueue(t.redis, `s6-recovery-${randomBytes(8).toString('hex')}`);
    ensure.mockImplementation((room, work) => enqueueLawyer(queue!, room, work));
    view(await submit()); const work = (await repo.readRoom(roomId)).workId!;
    const id = `lawyer:${roomId}:${work}`; expect(await queue.getJob(id)).toBeTruthy();
    await (await queue.getJob(id))!.remove(); ensure.mockClear();
    await t.app.rooms.current(a.id, false); expect(ensure).not.toHaveBeenCalled();
    await Promise.all([current(a), current(b)]);
    expect((await queue.getJobs(['waiting']))).toHaveLength(1); expect(ensure).toHaveBeenCalledTimes(2);
  });
});

describe('Stage 6 lawyer worker and ported policies', () => {
  it('worker rejects unknown jobs and auto without credentials stays demo', async () => {
    await expect(createLawyerProcessor(t.redis, demo)({ name: 'unknown', data: { roomId, workId: 'wrong' } } as Job<LawyerJobData>)).rejects.toThrow('UNKNOWN_JOB');
    view(await submit()); const generate = vi.fn(); await process(loadAiConfig({ JUDGE_AI_MODE: 'auto' }), generate);
    expect(generate).not.toHaveBeenCalled(); expect((await current()).messages[1]!.source).toBe('demo');
  });
  it('consult AI rejects new facts and provider failures retry once without leaking details', async () => {
    view(await submit('consult')); const generate = vi.fn().mockRejectedValue(new Error('provider-private-detail'));
    await process(ai, generate); expect(generate).toHaveBeenCalledTimes(2);
    expect((await current()).debate!.consultations[0]!.answer).toBe("Your lawyer couldn't answer this time.");
    view(await submit('consult'));
    await process(ai, vi.fn().mockResolvedValue({ kind: 'consult', source: 'ai', text: 'Use 999 new examples: https://invented.example' }));
    expect((await current()).debate!.consultations[1]!.source).toBe('fallback');
  });
  it('rules 5.1,5.5,5.12: demo finishes the presentation and publishes without AI', async () => {
    const generate = vi.fn(); view(await submit()); const pub = vi.spyOn(t.redis, 'publish');
    await process(demo, generate);
    expect((await current()).messages[1]).toMatchObject({ source: 'demo', text: 'My point: Gardens could help us share space.' });
    expect(generate).not.toHaveBeenCalled(); expect(pub).toHaveBeenCalledWith(ROOM_EVENTS_CHANNEL, roomId);
    await process(demo, generate); // Already finished work is ignored.
  });
  it('rule 5.1: fake AI success uses the chosen personality strictly as a style hint', async () => {
    await repo.setChoices(a.id, roomId, { lawyerId: 'jungle-fern' }); view(await submit());
    await repo.setChoices(a.id, roomId, { lawyerId: 'detective-arden' }); // Current work keeps the submitted identity.
    const generate = vi.fn().mockResolvedValue({ kind: 'lawyer', source: 'ai', text: 'Gardens may help us share space.' });
    await process(ai, generate);
    expect((await current()).messages[1]!.source).toBe('ai');
    const request = generate.mock.calls[0]![0];
    expect(lawyerInstructions(request)).toContain(resolveLawyer('jungle-fern', getTheme('courtroom'), 'A').personality);
    expect(lawyerInstructions(request)).toContain('Personality changes phrasing only');
  });
  it.each(['A new statistic: 9999 people.', 'See https://new.example.com', 'Player A wins', 'x'.repeat(200)])('rules 5.1-5.4: invalid AI output %s falls back to the raw text', async (text) => {
    const raw = 'Gardens might help our community.'; view(await submit('argument', a, raw));
    await process(ai, vi.fn().mockResolvedValue({ kind: 'lawyer', source: 'ai', text }));
    expect((await current()).messages[1]).toMatchObject({ text: raw, source: 'fallback' });
  });
  it.each(['Player A wins. That is my opinion.', 'I could hurt you over these gardens.'])('rules 5.3,5.5,5.11: outcome/unsafe raw text bypasses AI and remains an unedited fallback', async (raw) => {
    view(await submit('argument', a, raw)); const generate = vi.fn(); await process(ai, generate);
    expect(generate).not.toHaveBeenCalled(); expect((await current()).messages[1]).toMatchObject({ text: raw, source: 'fallback' });
  });
  it('rule 5.11: an unsafe consultation gets fixed safety text without an AI call', async () => {
    view(await submit('consult', a, 'They threaten me. What can I do?')); const generate = vi.fn(); await process(ai, generate);
    expect(generate).not.toHaveBeenCalled(); expect((await current()).debate!.consultations[0]!.answer).toMatch(/Threats or coercion/);
  });
  it('rule 5.4: a timed-out provider is retried once, then the consultation fallback resumes the same clock', async () => {
    view(await submit('consult'));
    let first!: () => void, second!: () => void;
    const started = new Promise<void>((resolve) => { first = resolve });
    const retried = new Promise<void>((resolve) => { second = resolve });
    const generate = vi.fn().mockImplementationOnce(() => { first(); return new Promise<never>(() => {}) })
      .mockImplementationOnce(() => { second(); return new Promise<never>(() => {}) });
    vi.useFakeTimers();
    const done = process({ ...ai, LAWYER_AI_TIMEOUT_MS: 5 } as typeof ai, generate);
    await started; expect(generate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5);
    await retried; expect(generate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5); await done; vi.useRealTimers();
    expect((await current()).debate!.consultations[0]!.answer).toBe("Your lawyer couldn't answer this time.");
    expect((await current()).debate!.activeSlot).toBe('A');
  });
  it('rule 5.10: context keeps eight public messages, own drafts and four answered own consultations only', async () => {
    view(await submit('consult')); const fields = await repo.readRoom(roomId);
    const answered = Array.from({ length: 6 }, (_, i) => ({ id: `own${i}`, ordinal: 1, question: `Own question ${i}`, answer: `Own answer ${i}`, source: 'demo', at: now }));
    fields['a.consultations'] = JSON.stringify(answered);
    fields['b.consultations'] = JSON.stringify([{ ...answered[0], question: 'OPPONENT_PRIVATE_QUESTION' }]);
    fields['b.drafts'] = JSON.stringify([{ id: 'opp', ordinal: 1, text: 'OPPONENT_PRIVATE_DRAFT', status: 'complete', at: now }]);
    fields['a.drafts'] = JSON.stringify([{ id: 'own', ordinal: 1, text: 'MY_OFFICIAL_DRAFT', status: 'complete', at: now }]);
    const messages = Array.from({ length: 20 }, (_, i) => JSON.stringify({ id: `m_${i}`, ordinal: 1, kind: 'argument', slot: i % 2 ? 'A' : 'B', text: `Public ${i}`, source: 'demo', at: now }));
    const request = lawyerRequest(fields, messages, 'ai'), context = lawyerContext(request);
    expect(context.messages).toHaveLength(8); expect(context.messages[0]!.text).toBe('Public 12');
    expect(context.officialDrafts![0]!.rawText).toBe('MY_OFFICIAL_DRAFT'); expect(context.privateConversation).toHaveLength(4);
    expect(context.privateConversation![0]!.playerText).toBe('Own question 2');
    expect(JSON.stringify(context)).not.toContain('OPPONENT_PRIVATE');
    expect(lawyerContext({ ...request, kind: 'lawyer' })).not.toHaveProperty('privateConversation');
  });
  it('integration: real queued demo arguments and private consultations reach a complete demo verdict', async () => {
    queue = createPlanQueue(t.redis, `s6-flow-${randomBytes(8).toString('hex')}`);
    ensure.mockImplementation((room, work) => enqueueLawyer(queue!, room, work));
    ensureJudge.mockImplementation((id, judge) => enqueueJudge(queue!, id, judge));
    connection = createQueueRedis(REDIS_URL);
    const options = { now: () => now, deadlinesKey, ensureJudge };
    const lawyer = createLawyerProcessor(connection, demo, undefined, options), judge = createJudgeProcessor(connection, demo, undefined, options);
    worker = new Worker(queue.name, (job) => job.name === 'lawyer' ? lawyer(job as Job<LawyerJobData>) : judge(job as Job<JudgeJobData>), { connection });
    await worker.waitUntilReady();
    const io = new Server<ClientToServerEvents, ServerToClientEvents>(t.app.server);
    const drain = registerSockets(io, t.app.rooms, t.redis, { verifyKeys: t.app.sessions.verifyKeys, logger: t.app.log });
    const subscriber = await connectedRedis(); const stopEvents = await subscribeRoomEvents(subscriber, t.app.rooms, t.app.log);
    const origin = await t.app.listen({ host: '127.0.0.1', port: 0 });
    const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = [];
    const cancellations: (() => void)[] = [];
    const next = (socket: typeof clients[number], version: number, predicate: (room: NonNullable<RoomResponse['room']>) => boolean = () => true) => new Promise<NonNullable<RoomResponse['room']>>((resolve, reject) => {
      const done = () => { clearTimeout(timer); socket.off('room:snapshot', receive) };
      const receive = (body: RoomResponse) => {
        const room = RoomResponse.parse(body).room;
        if (room && room.version >= version && predicate(room)) { done(); resolve(room) }
      };
      const timer = setTimeout(() => { done(); reject(new Error('Lawyer push timed out')) }, 4000);
      cancellations.push(done); socket.on('room:snapshot', receive);
    });
    async function connect(who: Player) {
      const socket = clientIo(origin, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], extraHeaders: { Cookie: `quarrel_access=${who.cookies.quarrel_access}` } });
      clients.push(socket); const ready = next(socket, 0); socket.connect(); await ready; return socket;
    }
    try {
    const sa = await connect(a), sb = await connect(b);
    async function completed(kind: 'argument' | 'consult', who: Player, ordinal: number) {
      const version = Number((await repo.readRoom(roomId)).version);
      const pushes = [next(sa, version + 2), next(sb, version + 2)];
      const response = await fetch(`${origin}/api/rooms/${roomId}/messages`, { method: 'POST', headers: {
        'Content-Type': 'application/json', Cookie: `quarrel_access=${who.cookies.quarrel_access}`,
      }, body: JSON.stringify({ kind, text: 'Our garden needs careful planning.', requestKey: randomUUID(), ordinal }) });
      expect(response.status).toBe(200); RoomResponse.parse(await response.json());
      const views = await Promise.all(pushes);
      expect(views.map((room) => room.you.slot)).toEqual(['A', 'B']);
      expect(views[0]!.messages).toEqual(views[1]!.messages);
      expect(views.every((room) => room.debate?.state === 'composing')).toBe(true);
    }
    async function expireTurns() {
      const ordinal = Number((await repo.readRoom(roomId)).ordinal);
      const summaries = [next(sa, 0, (r) => !!r.summary?.current), next(sb, 0, (r) => !!r.summary?.current)];
      now += 120001;
      await createDeadlineTick(t.redis, { error: vi.fn() }, options)();
      const saved = await Promise.all(summaries);
      expect(saved[0]!.summaries).toEqual(saved[1]!.summaries);
      const nextPhase = ordinal === 1 ? 'debate' : 'complete';
      const pushes = [next(sa, 0, (r) => r.setup.phase === nextPhase), next(sb, 0, (r) => r.setup.phase === nextPhase)];
      now += 4000;
      await createDeadlineTick(t.redis, { error: vi.fn() }, options)();
      return Promise.all(pushes);
    }
    await completed('consult', a, 1); await completed('consult', a, 1);
    expect((await submit('consult')).statusCode).toBe(429);
    await completed('argument', a, 1); await completed('argument', b, 1);
    expect((await current()).messages.filter((m) => m.kind === 'argument')).toHaveLength(2);
    expect((await expireTurns()).every((room) => room.debate?.ordinal === 2)).toBe(true);
    expect((await current()).debate!.ordinal).toBe(2);
    await completed('consult', b, 2); await completed('argument', b, 2);
    expect((await expireTurns()).every((room) => room.setup.phase === 'complete')).toBe(true);
    const ended = await current(); expect(ended.setup.phase).toBe('complete');
    expect(ended.verdict).toMatchObject({ source: 'demo', decision: 'inconclusive', outcome: 'split' });
    expect(ended.verdict).toEqual((await current(b)).verdict);
    expect(ended.debate!.consultations).toHaveLength(2); expect((await current(b)).debate!.consultations).toHaveLength(1);
    } finally {
      cancellations.forEach((cancel) => cancel()); clients.forEach((client) => client.disconnect());
      await io.close(); await drain(); await stopEvents();
    }
  });
});
