import { randomBytes } from "node:crypto";
import { Job, Worker } from "bullmq";
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomResponse } from "@quarrel/shared/contract";
import { migrate } from "../db/migrate";
import { ResultsRepo } from "../results/results-repo";
import { createArchiveProcessor } from "../worker/archive-worker";
import { enqueueArchive, queueBackoff, type ArchiveJobData } from "../rooms/plan-queue";
import { RoomRepo } from "../rooms/room-repo";
import { createPlanQueue, type JudgeJobData, type EnsureJudge } from "../rooms/plan-queue";
import { createQueueRedis } from "../common/redis";
import { loadAiConfig } from "../common/config";
import { createJudgeProcessor } from "../worker/judge-worker";
import { newPlayerId, secretKey, signAccessToken } from "../common/tokens";
import { connectedRedis, testDb, REDIS_URL, TEST_SECRET, testApp, type TestApp } from "./helpers";

type Player = { id: string; cookies: { quarrel_access: string } };
let t: TestApp, repo: RoomRepo, now: number, roomId: string, deadlinesKey: string, a: Player, b: Player;
let queue: ReturnType<typeof createPlanQueue> | undefined, worker: Worker | undefined, connection: ReturnType<typeof createQueueRedis> | undefined;
const pool = testDb();
beforeAll(async () => { await migrate(pool); });
afterAll(() => pool.end());
const ids = new Set<string>();
const archiveEnsure = vi.fn<import("../rooms/plan-queue").EnsureArchive>();
const judgeEnsure = vi.fn<EnsureJudge>();
const keys = new Set<string>();
const ensure = vi.fn<(roomId: string, workId: string) => Promise<void>>();
const ensureJudge = vi.fn<EnsureJudge>();
const demo = loadAiConfig({ JUDGE_AI_MODE: "demo" });
beforeEach(async () => {
  const redis = await connectedRedis(); const time = await redis.time(); redis.disconnect();
  now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  deadlinesKey = `deadlines:s8-${randomBytes(8).toString('hex')}`; keys.add(deadlinesKey);
  archiveEnsure.mockReset().mockResolvedValue();
  ensure.mockReset().mockResolvedValue();
  ensureJudge.mockReset().mockResolvedValue();
  judgeEnsure.mockReset().mockResolvedValue();
  t = await testApp({ db: pool, rooms: { now: () => now, deadlinesKey, ensureLawyer: ensure, ensureJudge: judgeEnsure, ensureArchive: archiveEnsure } });
  repo = new RoomRepo(t.redis, { now: () => now, deadlinesKey });
  const player = async (): Promise<Player> => {
    const id = newPlayerId(); keys.add(`player:${id}`); keys.add(`presence:${id}`);
    return { id, cookies: { quarrel_access: await signAccessToken(id, secretKey(TEST_SECRET)) } };
  };
  a = await player(); b = await player();
  const room = view(await post(a, '/api/rooms', { name: 'Ann', topic: 'Should we plant gardens?', durationSec: 120 }));
  roomId = room.roomId; ids.add(room.debateId);
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
  await pool.query("DELETE FROM debate_participants WHERE debate_id=ANY($1)", [[...ids]]);
  await pool.query("DELETE FROM debates WHERE id=ANY($1)", [[...ids]]);
  if (ids.size) { await t.redis.hdel('pending-archives', ...ids); await t.redis.del(...[...ids].map((id) => `archive:${id}`)); } ids.clear();
  if (keys.size) await t.redis.del(...keys); keys.clear(); await t.close(); vi.restoreAllMocks();
});
const post = (who: Player, url: string, payload?: Record<string, unknown>) => t.app.inject({ method: 'POST', url, cookies: who.cookies, ...(payload === undefined ? {} : { payload }) });
function view(response: Awaited<ReturnType<typeof post>>) {
  expect(response.statusCode, response.body).toBe(200); return RoomResponse.parse(response.json()).room!;
}
const current = async (who = a) => (await t.app.rooms.current(who.id)).room!;

const fields = () => repo.readRoom(roomId);
async function exhaust() { now += 120001; return repo.catchup(roomId); }
async function judge(config = demo, generate?: Parameters<typeof createJudgeProcessor>[2]) {
  const pending = (await repo.catchup(roomId)).judge;
  if (pending) await createJudgeProcessor(t.redis, config, generate, { now: () => now, deadlinesKey })({ name: pending.kind, data: { roomId, ...pending } } as Job<JudgeJobData>);
}
async function juryPhase() {
  await exhaust(); await judge(); now += 4000; await repo.catchup(roomId);
  await exhaust(); await judge(); now += 4000; await repo.catchup(roomId);
  expect((await fields()).phase).toBe('jury');
}

const complete = async () => { await juryPhase(); await judge(); return current(); };
async function archive() {
  const f = await fields(); ids.add(f.debateId!);
  await createArchiveProcessor(t.redis, pool)({ data: { roomId, debateId: f.debateId } } as Job<ArchiveJobData>);
  return current();
}
const get = (who: Player, url: string) => t.app.inject({ url, cookies: who.cookies });

describe('Stage 8 archives and results', () => {
  it('rule 7.1: public outbox survives deletion of the live room before the SQL write', async () => {
    await t.redis.hset(`room:${roomId}`, 'a.drafts', JSON.stringify([{id:'private',ordinal:1,text:'PRIVATE DRAFT',at:now,status:'complete'}]),
      'b.consultations', JSON.stringify([{id:'consult',ordinal:1,question:'PRIVATE QUESTION',answer:'PRIVATE ANSWER',source:'demo',at:now}]));
    const room = await complete();
    expect(await t.redis.get(`archive:${room.debateId}`)).not.toContain('PRIVATE');
    await t.redis.del(`room:${roomId}`,`room:${roomId}:messages`);
    expect((await get(a,`/api/results/${room.debateId}`)).json().error.code).toBe('RESULTS_NOT_READY');
    await createArchiveProcessor(t.redis,pool)({data:{roomId,debateId:room.debateId}} as Job<ArchiveJobData>);
    expect((await get(a,`/api/results/${room.debateId}`)).statusCode).toBe(200);
    expect(await t.redis.get(`archive:${room.debateId}`)).toBeNull();
  });
  it('rule 7.4: a participant cannot read an unfinished debate yet; unauthenticated requests fail', async () => {
    const id = (await fields()).debateId!;
    expect((await get(a,`/api/results/${id}`)).json().error.code).toBe('RESULTS_NOT_READY');
    expect((await t.app.inject({url:'/api/results'})).statusCode).toBe(401);
  });
  it('rule 7.1: concurrent duplicate archives write one public record and both seats, then mark archivedAt once', async () => {
    const room = await complete();
    await t.redis.hset(`room:${roomId}`, 'workText', 'PRIVATE WORK', 'a.drafts', JSON.stringify([{ id: 'private', ordinal: 1, text: 'PRIVATE DRAFT', at: now, status: 'complete' }]),
      'b.consultations', JSON.stringify([{ id: 'consult', ordinal: 1, question: 'PRIVATE QUESTION', answer: 'PRIVATE ANSWER', at: now, source: 'demo' }]));
    const job = { data: { roomId, debateId: room.debateId } } as Job<ArchiveJobData>;
    await Promise.all([createArchiveProcessor(t.redis, pool)(job), createArchiveProcessor(t.redis, pool)(job)]);
    const first = await current(); expect(first.archivedAt).not.toBeNull();
    const version = first.version; await archive(); expect((await current()).version).toBe(version);
    const stored = await pool.query('SELECT * FROM debates WHERE id=$1', [room.debateId]);
    expect(stored.rows).toHaveLength(1);
    const json = JSON.stringify(stored.rows[0]); for (const secret of ['PRIVATE', 'drafts', 'consultations', a.id, b.id]) expect(json).not.toContain(secret);
    const participants = await pool.query('SELECT slot FROM debate_participants WHERE debate_id=$1 ORDER BY slot', [room.debateId]);
    expect(participants.rows.map((p) => p.slot)).toEqual(['A', 'B']);
    expect(await t.redis.hget('pending-archives', room.debateId)).toBeNull();
  });
  it('rule 7.1: failed transaction rolls back and a retry archives; read recovery re-adds the missing job', async () => {
    const room = await complete(); await current();
    expect(archiveEnsure).toHaveBeenCalledWith(roomId, room.debateId);
    await expect(new ResultsRepo(pool).archive({ debateId: room.debateId, roomId, theme: 'courtroom', topic: 'Topic', durationSec: 120,
      names: { A: 'Ann', B: 'Bo' }, positions: { A: 'A', B: 'B' }, transcript: [], summaries: room.summaries, verdict: room.verdict!,
      createdAt: room.createdAt, completedAt: room.serverNow }, { A: a.id, B: undefined as unknown as string })).rejects.toThrow();
    expect((await pool.query('SELECT 1 FROM debates WHERE id=$1', [room.debateId])).rowCount).toBe(0);
    await archive(); expect((await get(a, `/api/results/${room.debateId}`)).statusCode).toBe(200);
    const processor = createArchiveProcessor(t.redis, pool);
    await processor({ data: { roomId, debateId: 'd_AAAAAAAAAAAAAAAAAAAAAA' } } as Job<ArchiveJobData>);
  });
  it('rules 7.2,7.4: participants get NOT_READY before archive; outsiders cannot distinguish pending, unknown or archived IDs', async () => {
    const room = await complete(), outsider = { id: newPlayerId(), cookies: { quarrel_access: await signAccessToken(newPlayerId(), secretKey(TEST_SECRET)) } };
    const url = `/api/results/${room.debateId}`;
    expect((await get(a, url)).json().error.code).toBe('RESULTS_NOT_READY');
    expect((await post(a, `${url}/ack`)).json().error.code).toBe('RESULTS_NOT_READY');
    expect((await get(outsider, url)).json().error.code).toBe('RESULTS_NOT_FOUND');
    expect((await get(a, '/api/results/d_AAAAAAAAAAAAAAAAAAAAAA')).json().error.code).toBe('RESULTS_NOT_FOUND');
    await repo.leave(a.id, roomId);
    expect((await get(a, url)).json().error.code).toBe('RESULTS_NOT_READY');
    // Closed complete rooms remain archivable for the two original participants.
    await createArchiveProcessor(t.redis, pool)({ data: { roomId, debateId: room.debateId } } as Job<ArchiveJobData>);
    for (const response of [await get(outsider, url), await post(outsider, `${url}/ack`)]) expect(response.json().error.code).toBe('RESULTS_NOT_FOUND');
    expect((await get(outsider, '/api/results')).json()).toEqual({ results: [] });
    await t.redis.del(`room:${roomId}`, `player:${a.id}`, `player:${b.id}`);
    for (const who of [a,b]) {
      const response = await get(who, url); expect(response.statusCode).toBe(200);
      expect(response.json().result.verdict).toEqual(room.verdict);
      expect((await get(who, '/api/results')).json().results).toHaveLength(1);
    }
  });
  it('rule 7.5: acknowledgements keep the first timestamp, are independent and still work after Redis deletion', async () => {
    const room = await complete(); await archive(); await t.redis.del(`room:${roomId}`);
    const url = `/api/results/${room.debateId}`;
    const responses = await Promise.all([post(a, `${url}/ack`), post(a, `${url}/ack`)]);
    const at = responses[0]!.json().result.acknowledgedAt;
    expect(at).toBeTruthy(); expect(responses[1]!.json().result.acknowledgedAt).toBe(at);
    expect((await get(b, url)).json().result.acknowledgedAt).toBeNull();
    expect((await post(b, `${url}/ack`)).json().result.acknowledgedAt).toBeTruthy();
    expect((await get(a, url)).json().result.acknowledgedAt).toBe(at);
  });
  it('rule 7.3: newest-first, at most 100, and room filtering are enforced in SQL', async () => {
    const room = await complete(); await archive(); const data = (await new ResultsRepo(pool).get(a.id, room.debateId))!;
    for (let index = 0; index < 102; index++) {
      const id = `d_${String(index).padStart(22,'0')}`; ids.add(id);
      await new ResultsRepo(pool).archive({ ...data, debateId: id, roomId: index === 0 ? 'r_AAAAAAAAAAAAAAAAAAAAAA' : roomId,
        completedAt: new Date(Date.parse(data.completedAt) + index + 1).toISOString() }, { A: a.id, B: b.id });
    }
    const list = (await get(a, '/api/results')).json().results;
    expect(list).toHaveLength(100); expect(list[0].debateId).toBe(`d_${String(101).padStart(22,'0')}`);
    expect(list.every((r: { completedAt: string }, i: number) => i === 0 || r.completedAt <= list[i-1].completedAt)).toBe(true);
    const filtered = (await get(a, '/api/results?roomId=r_AAAAAAAAAAAAAAAAAAAAAA')).json().results;
    expect(filtered).toHaveLength(1); expect(filtered[0].debateId).toBe(`d_${String(0).padStart(22,'0')}`);
    expect((await get(a, '/api/results?unknown=true')).statusCode).toBe(400);
  });
  it('rule 7.1: real archive queue uses stable IDs, retry backoff and publishes archivedAt', async () => {
    const room = await complete(); queue = createPlanQueue(t.redis, `s8-archive-${randomBytes(8).toString('hex')}`);
    connection = createQueueRedis(REDIS_URL);
    worker = new Worker(queue.name, createArchiveProcessor(connection, pool), { connection, settings: { backoffStrategy: queueBackoff } });
    await worker.waitUntilReady();
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Archive job timed out')), 4000);
      worker!.once('completed', () => { clearTimeout(timer); resolve(); });
    });
    await Promise.all([enqueueArchive(queue, roomId, room.debateId), enqueueArchive(queue, roomId, room.debateId)]); await done;
    expect((await current()).archivedAt).not.toBeNull();
    expect((await queue.getJobs(['completed']))).toHaveLength(1);
    expect(queueBackoff(1,'archive')).toBe(1000); expect(queueBackoff(99,'archive')).toBe(30000); expect(queueBackoff(2,'jury')).toBe(15000);
  });
  it('rules 7.6,7.9: a rematch can start before SQL archives the immutable previous debate', async () => {
    const room = await complete();
    await repo.rematch(a.id,roomId,room.debateId); await repo.rematch(b.id,roomId,room.debateId);
    const next = await current(); ids.add(next.debateId);
    expect(next.setup.phase).toBe('positions'); expect(next.archivedAt).toBeNull();
    expect((await get(a,`/api/results/${room.debateId}`)).json().error.code).toBe('RESULTS_NOT_READY');
    await createArchiveProcessor(t.redis,pool)({data:{roomId,debateId:room.debateId}} as Job<ArchiveJobData>);
    expect((await get(a,`/api/results/${room.debateId}`)).statusCode).toBe(200);
    expect((await current()).archivedAt).toBeNull();
    expect((await current()).debateId).toBe(next.debateId);
  });
});

describe('Stage 8 rematches', () => {
  it('rules 7.6,7.8,7.9: first request waits, repeat is a no-op, second clears only debate state and preserves archived result', async () => {
    const room = await complete();
    expect((await post(a, `/api/rooms/${roomId}/rematch`, { debateId: room.debateId })).statusCode).toBe(200);
    await archive(); await t.redis.hset(`room:${roomId}`, 'a.characterId','jungle-lion','b.lawyerId','courtroom-sage');
    const before = await fields();
    const first = view(await post(a, `/api/rooms/${roomId}/rematch`, { debateId: room.debateId }));
    expect(first.rematch).toEqual({ A: true, B: false }); expect(first.setup.phase).toBe('complete');
    expect(view(await post(a, `/api/rooms/${roomId}/rematch`, { debateId: room.debateId })).version).toBe(first.version);
    const next = view(await post(b, `/api/rooms/${roomId}/rematch`, { debateId: room.debateId })); ids.add(next.debateId);
    expect(next.debateId).not.toBe(room.debateId); expect(next.setup).toMatchObject({ phase: 'positions', theme: room.setup.theme, topic: room.setup.topic, durationSec: room.setup.durationSec, positions: { A: null, B: null } });
    expect(next).toMatchObject({ plan: null, startsAt: null, debate: null, messages: [], summaries: [], summary: null, jury: null, verdict: null, archivedAt: null, rematch: { A:false, B:false } });
    const f = await fields();
    for (const key of ['ordinal','activeSlot','deadline','a.remainingMs','b.remainingMs','a.drafts','b.consultations','workId','showUntil','juryAttempts','juryRound','messageSeq','completedAt']) expect(f[key]).toBeUndefined();
    for (const key of ['theme','topic','durationSec','a.player','b.player','a.name','b.name','a.characterId','b.lawyerId','createdAt','expiresAt']) expect(f[key]).toBe(before[key]);
    expect(next.players.every((p) => !p.ready)).toBe(true); expect(await t.redis.zscore(deadlinesKey,roomId)).toBeNull();
    expect((await get(a, `/api/results/${room.debateId}`)).statusCode).toBe(200);
    expect((await post(a, `/api/rooms/${roomId}/rematch`, { debateId: room.debateId })).json().error.code).toBe('STALE_DEBATE');
  });
  it('rules 7.6,7.7: simultaneous requests create exactly one new debate; closed and stale requests are rejected', async () => {
    const room = await complete(); await archive();
    const results = await Promise.all([post(a, `/api/rooms/${roomId}/rematch`, { debateId: room.debateId }),post(b, `/api/rooms/${roomId}/rematch`, { debateId: room.debateId }),post(a, `/api/rooms/${roomId}/rematch`, { debateId: room.debateId })]);
    const next = await current(); ids.add(next.debateId); expect(next.setup.phase).toBe('positions'); expect(next.debateId).not.toBe(room.debateId);
    expect(results.every((r) => r.statusCode === 200 || r.json().error.code === 'STALE_DEBATE')).toBe(true);
    const id = next.debateId; expect((await current()).debateId).toBe(id);
    await t.redis.hset(`room:${roomId}`, 'phase','complete','archivedAt',now,'closed','1');
    expect((await post(a, `/api/rooms/${roomId}/rematch`, { debateId: id })).json().error.code).toBe('ROOM_CLOSED');
  });
  it('rule 7.8: prior-debate plan and judge jobs cannot affect a rematch', async () => {
    const room = await complete(); await archive(); await repo.rematch(a.id,roomId,room.debateId); await repo.rematch(b.id,roomId,room.debateId);
    const next = await fields(); ids.add(next.debateId!);
    await t.redis.hset(`room:${roomId}`, 'phase','planning');
    expect(await repo.savePlan(roomId,room.plan!,room.debateId)).toMatchObject({ changed:false });
    await t.redis.hset(`room:${roomId}`, 'phase','jury','juryRound',1,'juryStatus','pending','juryAttempts',0);
    expect(await repo.judgeInput(roomId,{kind:'jury',index:1,debateId:room.debateId},'old')).toMatchObject({fields:null});
    expect((await fields()).juryAttempts).toBe('0');
  });
});

