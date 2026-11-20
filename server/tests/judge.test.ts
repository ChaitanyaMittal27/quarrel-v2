import { randomBytes, randomUUID } from "node:crypto";
import { Job, Worker } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomResponse, type SubmitMessageRequest } from "@quarrel/shared/contract";
import { RoomRepo } from "../rooms/room-repo";
import { createPlanQueue, enqueueJudge, type JudgeJobData, type EnsureJudge, juryBackoff } from "../rooms/plan-queue";
import { createQueueRedis } from "../common/redis";
import { loadAiConfig } from "../common/config";
import { createJudgeProcessor, judgeRequest, fallbackSummary, savedSummaries, localVerdict } from "../worker/judge-worker";
import { JuryUnavailableError } from "../worker/ai/lawyer-errors";
import { UnrecoverableError } from "bullmq";
import { createDeadlineTick } from "../worker/clock-worker";
import { newPlayerId, secretKey, signAccessToken } from "../common/tokens";
import { connectedRedis, REDIS_URL, TEST_SECRET, testApp, type TestApp } from "./helpers";

type Player = { id: string; cookies: { quarrel_access: string } };
let t: TestApp, repo: RoomRepo, now: number, roomId: string, deadlinesKey: string, a: Player, b: Player;
let queue: ReturnType<typeof createPlanQueue> | undefined, worker: Worker | undefined, connection: ReturnType<typeof createQueueRedis> | undefined;
const judgeEnsure = vi.fn<EnsureJudge>();
const keys = new Set<string>();
const ensure = vi.fn<(roomId: string, workId: string) => Promise<void>>();
const ensureJudge = vi.fn<EnsureJudge>();
const demo = loadAiConfig({ JUDGE_AI_MODE: "demo" });
const ai = loadAiConfig({ JUDGE_AI_MODE: "auto", GEMINI_API_KEY: "fake-test-key" });
beforeEach(async () => {
  const redis = await connectedRedis(); const time = await redis.time(); redis.disconnect();
  now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  deadlinesKey = `deadlines:s7-${randomBytes(8).toString('hex')}`; keys.add(deadlinesKey);
  ensure.mockReset().mockResolvedValue();
  ensureJudge.mockReset().mockResolvedValue();
  judgeEnsure.mockReset().mockResolvedValue();
  t = await testApp({ rooms: { now: () => now, deadlinesKey, ensureLawyer: ensure, ensureJudge: judgeEnsure } });
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
const failure = (reason: ConstructorParameters<typeof JuryUnavailableError>[0]) => vi.fn(async () => { throw new JuryUnavailableError(reason, true, 9999) });

describe('Stage 7 Redis transitions', () => {
  it('exhaustion immediately falls back for summaries, pauses jury retries and atomically unlocks after reset', async () => {
    const model = `quota-judge-${roomId}`, key = `ai:exhausted:${model}`; keys.add(key);
    const reset = now + 60000; await t.redis.set(key, reset, 'PX', 60000);
    const generate = vi.fn(), config = { ...ai, GEMINI_MODEL: model };
    await exhaust(); await judge(config, generate);
    expect(JSON.parse((await fields()).summaries!)[0]).toMatchObject({ source: 'fallback' });
    expect(generate).not.toHaveBeenCalled();
    now += 4000; await repo.catchup(roomId); await exhaust(); await judge(config, generate);
    now += 4000; await repo.catchup(roomId);
    await expect(judge(config, generate)).rejects.toThrow('quota_exhausted');
    expect(await fields()).toMatchObject({ juryStatus: 'retry_required', juryError: 'quota_exhausted', juryAttempts: '1', juryRetryAvailableAt: String(reset) });
    expect(generate).not.toHaveBeenCalled();
    const guarded = new RoomRepo(t.redis, { now: () => now, deadlinesKey, quotaModels: [model, model] });
    expect(await guarded.retryJury(a.id, roomId)).toMatchObject({ status: 'JURY_QUOTA_EXHAUSTED' });
    await t.redis.pexpire(key, 0);
    expect(await guarded.retryJury(a.id, roomId)).toMatchObject({ status: 'OK', changed: true });
  });
  it('rules 6.3,6.5,6.18: jury claim fencing and wrong-round completion cannot overwrite the current attempt', async () => {
    await juryPhase(); const pending = { kind: 'jury' as const, index: 1 };
    const input = await repo.judgeInput(roomId, pending, 'old'); await repo.judgeInput(roomId, pending, 'new');
    const verdict = localVerdict(judgeRequest(input.fields!, input.messages, 'jury', 'demo'), savedSummaries(input.fields!), 'demo');
    expect(await repo.finishJury(roomId, 1, 'old', verdict)).toMatchObject({ changed: false });
    expect(await repo.finishJury(roomId, 2, 'new', verdict)).toMatchObject({ changed: false });
    expect(await repo.finishJury(roomId, 1, 'new', verdict)).toMatchObject({ changed: true });
    expect(await repo.finishJury(roomId, 1, 'new', verdict)).toMatchObject({ changed: false });
  });
  it('rule 6.21: membership, closure and expiry are rechecked for manual retry', async () => {
    await juryPhase(); await expect(judge(ai, failure('quota_exhausted'))).rejects.toThrow();
    expect(await repo.retryJury('not-seated', roomId)).toMatchObject({ status: 'ROOM_NOT_FOUND' });
    await t.redis.set('player:not-seated', 'another-room'); keys.add('player:not-seated');
    expect(await repo.retryJury('not-seated', roomId)).toMatchObject({ status: 'STALE_ROOM' });
    await t.redis.set('player:not-seated', roomId); keys.add('player:not-seated');
    expect(await repo.retryJury('not-seated', roomId)).toMatchObject({ status: 'ROOM_NOT_FOUND' });
    await t.redis.hset(`room:${roomId}`, 'closed', '1'); expect(await repo.retryJury(a.id, roomId)).toMatchObject({ status: 'ROOM_CLOSED' });
    await t.redis.hset(`room:${roomId}`, 'closed', '0', 'expiresAt', now - 1); expect(await repo.retryJury(a.id, roomId)).toMatchObject({ status: 'ROOM_EXPIRED' });
  });
  it('rule 6.2,6.7,6.24: summary entry once, random work and observed-time deadline; no clock charging', async () => {
    const before = Number((await fields()).version);
    const results = await Promise.all([exhaust(), repo.catchup(roomId)]);
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    const f = await fields();
    expect(f).toMatchObject({ phase: 'summary', state: 'summary', 'a.remainingMs': '0', 'b.remainingMs': '0', ordinal: '1' });
    expect(f.workId).toMatch(/^w_[\w-]{22}$/);
    expect(Number(f.workDeadline)).toBe(now + 30000);
    expect(Number(f.version)).toBe(before + 2);
    now += 10000; await repo.catchup(roomId);
    expect(await fields()).toEqual(f);
    expect((await current()).debate).toMatchObject({ activeSlot: null, deadline: null, clocks: { A: 0, B: 0 } });
    expect(judgeEnsure).toHaveBeenCalledWith(roomId, expect.objectContaining({ kind: 'summary', index: 1, workId: f.workId }));
  });
  it('rules 6.3,6.5,6.11: summary claim fence, exactly once, four seconds, anchored next turn', async () => {
    const pending = (await exhaust()).judge!;
    await repo.judgeInput(roomId, pending, 'old'); await repo.judgeInput(roomId, pending, 'new');
    expect(await repo.finishSummary(roomId, pending.workId!, 'old', 'Stale.', 'ai')).toMatchObject({ changed: false });
    const before = Number((await fields()).version);
    await repo.finishSummary(roomId, pending.workId!, 'new', 'Both offered reasons. Their claims remain unverified.', 'ai');
    expect(Number((await fields()).version)).toBe(before + 1);
    expect(await repo.finishSummary(roomId, pending.workId!, 'new', 'Duplicate.', 'ai')).toMatchObject({ changed: false });
    const showUntil = now + 4000;
    expect(Number(await t.redis.zscore(deadlinesKey, roomId))).toBe(showUntil);
    now = showUntil - 1; expect(await repo.catchup(roomId)).toMatchObject({ changed: false });
    now = showUntil + 500; await repo.catchup(roomId);
    const room = await current();
    expect(room.setup.phase).toBe('debate');
    expect(room.debate).toMatchObject({ ordinal: 2, activeSlot: 'B', clocks: { A: 60000, B: 59500 } });
    expect(Date.parse(room.debate!.deadline!)).toBe(showUntil + 60000);
    expect(room.summaries).toHaveLength(1);
    expect(room.messages.at(-2)).toMatchObject({ kind: 'judge_summary', label: 'S1-J', source: 'ai' });
  });
  it.each(['read', 'poller'])('rules 6.4,6.5,6.10: %s recovers timed-out summary and ignores late result', async (path) => {
    view(await submit('argument', a, 'A public point.')); await finish('A public point.');
    view(await submit('argument', b, 'B public point.')); await finish('B public point.');
    const pending = (await exhaust()).judge!; await repo.judgeInput(roomId, pending, 'late');
    now += 30000;
    if (path === 'read') await current();
    else await createDeadlineTick(t.redis, { error: vi.fn() }, { now: () => now, deadlinesKey })();
    const room = await current();
    expect(room.summary?.current).toMatchObject({ source: 'fallback', text: 'Ann\'s unverified last public point: "A public point...". Bo\'s unverified last public point: "B public point...".' });
    const f = await fields();
    expect(await repo.finishSummary(roomId, pending.workId!, 'late', 'Late.', 'ai')).toMatchObject({ changed: false });
    expect(await fields()).toEqual(f);
  });
  it('rules 6.12,6.17,6.18,6.22,6.23: last summary enters jury without deadline; canonical demo finishes once for both players', async () => {
    await juryPhase(); const pending = (await repo.catchup(roomId)).judge!;
    expect(pending).toMatchObject({ kind: 'jury', index: 1 });
    expect(await t.redis.zscore(deadlinesKey, roomId)).toBeNull();
    const before = await fields(); now += 999999; await repo.catchup(roomId); expect(await fields()).toEqual(before);
    await judge(); const room = await current();
    expect(room.setup.phase).toBe('complete');
    expect(room.verdict).toMatchObject({ source: 'demo', decision: 'inconclusive', outcome: 'split', text: 'This demo hearing between Ann and Bo has no competitive judgment.' });
    expect(room.verdict!.subtopicSummaries).toEqual(room.summaries);
    expect(room.verdict).toEqual((await current(b)).verdict);
    const completed = await fields();
    expect(await repo.finishJury(roomId, 1, 'late', room.verdict)).toMatchObject({ changed: false });
    expect(await fields()).toEqual(completed);
    expect(await repo.judgeInput(roomId, pending, 'duplicate')).toMatchObject({ fields: null });
  });
  it('rule 6.17: missing canonical summaries is SUMMARIES_NOT_READY', async () => {
    await juryPhase(); const input = await repo.judgeInput(roomId, { kind: 'jury', index: 1 }, 'claim');
    const request = judgeRequest(input.fields!, input.messages, 'jury', 'demo');
    const verdict = localVerdict(request, savedSummaries(input.fields!), 'demo');
    await t.redis.hset(`room:${roomId}`, 'summaries', '[]');
    expect(await repo.finishJury(roomId, 1, 'claim', verdict)).toMatchObject({ status: 'SUMMARIES_NOT_READY' });
    expect((await fields()).phase).toBe('jury');
  });
  it('rules 6.20,6.21: bounded failures, either seat retry, pending guard and Redis cooldown', async () => {
    expect((await post(a, `/api/rooms/${roomId}/jury/retry`)).json().error.code).toBe('WRONG_PHASE');
    await juryPhase();
    expect((await post(a, `/api/rooms/${roomId}/jury/retry`)).json().error.code).toBe('JURY_NOT_READY');
    for (let attempt = 1; attempt <= 3; attempt++) {
      await expect(judge(ai, failure('rate_limited'))).rejects.toThrow('rate_limited');
      expect((await current()).jury!.status).toBe(attempt === 3 ? 'retry_required' : 'pending');
      expect((await current()).verdict).toBeNull();
    }
    const response = await post(b, `/api/rooms/${roomId}/jury/retry`); expect(response.statusCode).toBe(200);
    expect((await fields()).juryRound).toBe('2'); expect((await fields()).juryAttempts).toBe('0');
    expect(judgeEnsure).toHaveBeenCalledWith(roomId, { kind: 'jury', index: 2 });
    await expect(judge(ai, failure('quota_exhausted'))).rejects.toBeInstanceOf(UnrecoverableError);
    expect((await post(a, `/api/rooms/${roomId}/jury/retry`)).json().error.code).toBe('JURY_RETRY_COOLDOWN');
    now += 60000; expect((await post(a, `/api/rooms/${roomId}/jury/retry`)).statusCode).toBe(200);
    expect((await fields()).juryRound).toBe('3');
  });
  it('rules 6.1,6.22: read recovery deduplicates stable job IDs and never recovers retry_required', async () => {
    queue = createPlanQueue(t.redis, `s7-jobs-${randomBytes(8).toString('hex')}`);
    judgeEnsure.mockImplementation((id, work) => enqueueJudge(queue!, id, work));
    await exhaust(); await current(); await current();
    const jobs = await queue.getJobs(['waiting']); expect(jobs).toHaveLength(1); expect(jobs[0]!.id).toBe(`summary:${roomId}:${(await fields()).debateId}-1`);
    await judge(); now += 4000; await repo.catchup(roomId); await exhaust(); await judge(); now += 4000; await repo.catchup(roomId);
    await current(); await current();
    expect(await queue.getJob(`jury:${roomId}:${(await fields()).debateId}-1`)).toBeTruthy();
    judgeEnsure.mockClear(); await expect(judge(ai, failure('missing_configuration'))).rejects.toBeInstanceOf(UnrecoverableError);
    await current(); expect(judgeEnsure).not.toHaveBeenCalled();
  });
});

describe('Stage 7 worker policies', () => {
  it('rule 6.20: real BullMQ performs three attempts with fixed 5s/15s backoff, ignoring provider retryAfter', async () => {
    await juryPhase(); queue = createPlanQueue(t.redis, `s7-backoff-${randomBytes(8).toString('hex')}`);
    connection = createQueueRedis(REDIS_URL);
    const generate = failure('rate_limited');
    worker = new Worker(queue.name, createJudgeProcessor(connection, ai, generate, { now: () => now, deadlinesKey }), { connection, settings: { backoffStrategy: juryBackoff } });
    await worker.waitUntilReady();
    const nextFailure = () => new Promise<void>((resolve, reject) => {
      const done = () => { clearTimeout(timer); worker!.off('failed', failed); };
      const failed = () => { done(); resolve(); };
      const timer = setTimeout(() => { done(); reject(new Error('Jury failure timed out')); }, 4000);
      worker!.on('failed', failed);
    });
    let failed = nextFailure(); await enqueueJudge(queue, roomId, { kind: 'jury', index: 1 }); await failed;
    const first = (await queue.getJob(`jury:${roomId}:1`))!;
    expect(first.opts.attempts).toBe(3); expect(first.delay).toBe(5000); expect(first.attemptsMade).toBe(1);
    failed = nextFailure(); await first.promote(); await failed;
    const second = (await queue.getJob(`jury:${roomId}:1`))!;
    expect(second.delay).toBe(15000); expect(second.attemptsMade).toBe(2);
    failed = nextFailure(); await second.promote(); await failed;
    expect(generate).toHaveBeenCalledTimes(3); expect((await current()).jury).toMatchObject({ status: 'retry_required', errorCode: 'rate_limited' });
    expect((await current()).verdict).toBeNull();
  });
  it('rules 6.14-6.18: a fake AI verdict cites real own presentations and attaches only canonical summaries', async () => {
    view(await submit('argument', a)); await finish('A public argument.');
    view(await submit('argument', b)); await finish('B public argument.');
    await juryPhase();
    const generate = vi.fn(async (request: import('@quarrel/shared/types').LawyerJob) => {
      expect(JSON.stringify(request)).not.toContain('officialDrafts');
      expect(JSON.stringify(request)).not.toContain('consultations');
      const label = (slot: 'A' | 'B') => request.context.messages.find((m) => m.kind === 'argument' && m.slot === slot)!.label;
      return { kind: 'jury' as const, source: 'ai' as const, text: 'The public arguments support different priorities.', verdict: {
        decision: 'tie' as const, outcome: 'split' as const, reasoning: 'The two public reasons carry comparable weight.',
        strongestArguments: { A: `The point in [${label('A')}] describes shared space.`, B: `The point in [${label('B')}] describes costs.` },
        weaknesses: { A: ['More evidence would help.'], B: ['More evidence would help.'] },
        perSubtopic: [{ ordinal: 1, text: 'The reasons differ.' }, { ordinal: 2, text: 'The tradeoffs remain uncertain.' }], compromise: 'Try a smaller shared space.',
      } };
    });
    await judge(ai, generate);
    const v = (await current()).verdict!; expect(v.source).toBe('ai'); expect(v.decision).toBe('tie');
    expect(v.topic).toBe('Should we plant gardens?'); expect(v.positionA).toBe('Consider the costs and benefits.');
    expect(v.subtopicSummaries).toEqual((await current()).summaries);
    expect(v).toEqual((await current(b)).verdict);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it.each(['missing-side', 'foreign-citation', 'bad-shape', 'invented-summaries'])('rules 6.14-6.17: reject %s without fabricating a verdict', async (invalid) => {
    await juryPhase();
    const generate = vi.fn(async () => ({ kind: 'jury' as const, source: 'ai' as const, text: 'Public claims remain unverified.', verdict: {
      decision: invalid === 'missing-side' ? 'A' as const : 'inconclusive' as const, outcome: 'split' as const, reasoning: 'Evidence is limited.',
      strongestArguments: { A: invalid === 'foreign-citation' ? '[S99-P1L1M1] A claim.' : 'No public submission.', B: 'No public submission.' },
      weaknesses: { A: [], B: [] }, perSubtopic: invalid === 'bad-shape' ? [] : [{ ordinal: 1, text: 'No finding.' }, { ordinal: 2, text: 'No finding.' }], compromise: null,
      ...(invalid === 'invented-summaries' ? { subtopicSummaries: [] } : {}),
    } }));
    await expect(judge(ai, generate)).rejects.toThrow('invalid_response');
    expect((await current()).verdict).toBeNull();
  });
  it('rule 6.20: a missing AI key immediately requires manual retry without a provider request', async () => {
    await juryPhase(); const generate = vi.fn();
    await expect(judge(loadAiConfig({ JUDGE_AI_MODE: 'auto' }), generate)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(generate).not.toHaveBeenCalled(); expect((await current()).jury!.errorCode).toBe('missing_configuration');
  });
  it('rules 6.4,6.6: bounded summary and jury calls time out without provider details', async () => {
    await exhaust(); vi.useFakeTimers(); const generate = vi.fn(() => new Promise<never>(() => {}));
    const result = judge(ai, generate);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(5000); await result; vi.useRealTimers();
    expect((await current()).summary!.current!.source).toBe('fallback');
    now += 4000; await repo.catchup(roomId); await exhaust(); await judge(); now += 4000; await repo.catchup(roomId);
    vi.useFakeTimers(); generate.mockClear(); const juryResult = judge(ai, generate).catch((error: Error) => error);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(ai.JUDGE_AI_TIMEOUT_MS); expect(await juryResult).toMatchObject({ message: 'timeout' });
    vi.useRealTimers(); expect((await current()).jury!.errorCode).toBeNull();
  });
  it('rules 6.8,6.10,6.13: allowlisted public-only context; Unicode bounded fallback agrees with Lua', async () => {
    await t.redis.hset(`room:${roomId}`, 'a.drafts', '[{"text":"PRIVATE DRAFT"}]', 'b.consultations', '[{"question":"PRIVATE QUESTION"}]');
    // Store already-public points directly; the judge never sees raw/owner-only fields.
    const text = '😀'.repeat(600);
    await t.redis.rpush(`room:${roomId}:messages`, JSON.stringify({ id: 'm_2', ordinal: 1, kind: 'argument', slot: 'A', text, at: now, source: 'demo', rawText: 'PRIVATE RAW' }));
    await t.redis.rpush(`room:${roomId}:messages`, JSON.stringify({ id: 'm_3', ordinal: 2, kind: 'argument', slot: 'B', text: 'Different subtopic', at: now, source: 'demo' }));
    const pending = (await exhaust()).judge!; const input = await repo.judgeInput(roomId, pending, 'claim');
    const request = judgeRequest(input.fields!, input.messages, 'summary', 'ai');
    expect(JSON.stringify(input.fields)).not.toContain('PRIVATE'); expect(JSON.stringify(request)).not.toContain('PRIVATE');
    expect(request.context.messages).toHaveLength(1);
    const fallback = fallbackSummary(request); expect([...fallback].length).toBeLessThanOrEqual(700); expect(fallback.split(/\s+/).length).toBeLessThanOrEqual(70);
    now += 30000; await repo.catchup(roomId);
    expect(JSON.parse((await fields()).summaries!)[0].text).toBe(fallback);
  });
  it.each(['many words', 'Unicode'])('rules 6.9,6.10: named fallback keeps word/character bounds and matches Lua (%s)', async (mode) => {
    const names = mode === 'many words' ? ['A '.repeat(15) + 'A', 'B\u2028'.repeat(15) + 'B'] : ['😀'.repeat(32), '界'.repeat(32)];
    await t.redis.hset(`room:${roomId}`, 'a.name', names[0]!, 'b.name', names[1]!);
    for (const slot of ['A', 'B']) await t.redis.rpush(`room:${roomId}:messages`, JSON.stringify({ id: `long_${slot}`, ordinal: 1, kind: 'argument', slot,
      text: mode === 'many words' ? 'point '.repeat(100) : '😀'.repeat(600), at: now, source: 'demo' }));
    const pending = (await exhaust()).judge!;
    const input = await repo.judgeInput(roomId, pending, 'claim');
    const request = judgeRequest(input.fields!, input.messages, 'summary', 'demo');
    const text = fallbackSummary(request);
    for (const name of names) expect(text).toContain(name.replace(/\s+/gu, ' ').trim());
    expect([...text].length).toBeLessThanOrEqual(700); expect(text.split(/\s+/u).length).toBeLessThanOrEqual(70);
    expect(text).not.toMatch(/Player [AB]/u);
    now += 30000; await repo.catchup(roomId);
    expect((await current()).summary!.current!.text).toBe(text);
  });
  it.each(['invalid', 'throw', 'success'])('rule 6.9: summary %s gets validated, retried once then labelled', async (mode) => {
    await exhaust(); const generate = vi.fn(async () => {
      if (mode === 'throw') throw new Error('PROVIDER SECRET DETAIL');
      return { kind: 'summary' as const, source: 'ai' as const, text: mode === 'success' ? 'Both sides offered different reasons. Their claims remain unverified.' : 'Player A wins.' };
    });
    await judge(ai, generate);
    expect(generate).toHaveBeenCalledTimes(mode === 'success' ? 1 : 2);
    expect((await current()).summary!.current!.source).toBe(mode === 'success' ? 'ai' : 'fallback');
    expect(JSON.stringify(await fields())).not.toContain('PROVIDER SECRET');
  });
  it('rules 6.6,6.19,6.20: unknown provider errors become fixed codes; attempts survive missing-job recovery', async () => {
    await juryPhase();
    for (let attempt = 0; attempt < 3; attempt++) await expect(judge(ai, vi.fn(async () => { throw new Error('SECRET provider body') }))).rejects.toThrow('provider_unavailable');
    expect((await current()).jury).toMatchObject({ status: 'retry_required', errorCode: 'provider_unavailable' });
    expect(JSON.stringify(await fields())).not.toContain('SECRET');
    expect(juryBackoff(1)).toBe(5000); expect(juryBackoff(2)).toBe(15000);
  });
  it.each(['quota_exhausted', 'missing_configuration'] as const)('rule 6.20: %s stops immediately with UnrecoverableError', async (reason) => {
    await juryPhase(); await expect(judge(ai, failure(reason))).rejects.toBeInstanceOf(UnrecoverableError);
    expect((await current()).jury).toMatchObject({ status: 'retry_required', errorCode: reason });
    expect((await fields()).juryAttempts).toBe('1');
  });
  it('v2 safety decision: unsafe public dispute skips AI and saves fixed inconclusive verdict', async () => {
    await t.redis.hset(`room:${roomId}`, 'topic', 'I will kill you if you leave me');
    const generate = vi.fn(); await exhaust(); await judge(ai, generate);
    expect((await current()).summary!.current!.source).toBe('fallback');
    now += 4000; await repo.catchup(roomId); await exhaust(); await judge(ai, generate); now += 4000; await repo.catchup(roomId); await judge(ai, generate);
    expect(generate).not.toHaveBeenCalled();
    expect((await current()).verdict).toMatchObject({ source: 'safety', decision: 'inconclusive', outcome: 'split' });
  });
});

