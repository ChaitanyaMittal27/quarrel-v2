import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyQuotaError } from '../worker/ai/quota-errors';
import { nextQuotaReset, QuotaStore } from '../ai/quota-store';
import { generateLawyerResult } from '../worker/ai/judge-engine';
import { loadAiConfig } from '../common/config';
import { connectedRedis, testSession, workingDb } from './helpers';
import { buildApp } from '../api/app';
import type { LawyerJob } from '@quarrel/shared/types';
import { newPlayerId, secretKey, signAccessToken } from '../common/tokens';
import { TEST_SECRET } from './helpers';

afterEach(() => vi.unstubAllGlobals());
describe('provider quota classification (SDK status + JSON message fixtures)', () => {
  it.each([
    [{status:429,message:JSON.stringify({error:{code:429,message:'Quota exceeded',details:[{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:'GenerateContentRequestsPerDayPerProjectPerModel-FreeTier'}]},{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'30s'}]}})},'DAILY_EXHAUSTED'],
    [{status:429,error:{message:'requests per day exceeded'}},'DAILY_EXHAUSTED'],
    [{status:429,error:{message:'Per-minute requests exceeded',details:[{retryDelay:'40s'}]}},'RATE_LIMITED'],
    [{status:429,message:'requests per minute'},'RATE_LIMITED'],
    [{status:429,message:'unknown private provider body'},'RATE_LIMITED'],
    [{status:429,error:{details:[{retryDelay:'119s'}]}},'RATE_LIMITED'],
    [{error:{code:429,message:'daily limit exceeded'}},'DAILY_EXHAUSTED'],
    [{status:503,message:'daily quota'},null], [null,null], [{status:429,message:'x'.repeat(70000)},'RATE_LIMITED'],
  ])('classifies safely %#', (fixture, expected) => expect(classifyQuotaError(fixture)).toBe(expected));
});
describe('quota reset timezone', () => {
  it.each([
    ['2026-03-08T08:00:00.000Z','2026-03-09T07:00:00.000Z'],
    ['2026-11-01T07:00:00.000Z','2026-11-02T08:00:00.000Z'],
    ['2026-11-20T20:12:00.000Z','2026-11-21T08:00:00.000Z'],
  ])('uses the next LA midnight including DST: %s', (now, expected) => expect(new Date(nextQuotaReset(Date.parse(now))).toISOString()).toBe(expected));
  it('supports a different timezone', () => expect(nextQuotaReset(Date.parse('2026-11-20T12:00:00Z'),'UTC')).toBe(Date.parse('2026-11-21T00:00:00Z')));
});
const job: LawyerJob = { id:'test',kind:'jury',mode:'ai',slot:null,playerText:null,context:{themeId:'courtroom',topic:'Gardens',totalSeconds:120,currentSubtopic:1,players:[{slot:'A',name:'Ann',position:'Yes'},{slot:'B',name:'Bo',position:'No'}],subtopics:[{ordinal:1,question:'Benefits?',secondsPerPlayer:60},{ordinal:2,question:'Costs?',secondsPerPlayer:60}],messages:[]} };
it('daily errors mark models, skip exhausted primary/fallback across calls, and demo ignores both', async () => {
  const redis = await connectedRedis();
  const primary=`quota-${randomUUID()}`, fallback=`quota-${randomUUID()}`;
  const config=loadAiConfig({JUDGE_AI_MODE:'auto',GEMINI_API_KEY:'fake-key',GEMINI_MODEL:primary,GEMINI_FALLBACK_MODEL:fallback});
  const quota=new QuotaStore(redis,config);
  const fake=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(JSON.stringify({error:{code:429,details:[{violations:[{quotaId:'RequestsPerDay'}]}]}}),{status:429}));
  vi.stubGlobal('fetch',fake);
  try {
    await expect(generateLawyerResult(job,config,false,quota)).rejects.toMatchObject({reasonCode:'quota_exhausted',retryable:false});
    expect(fake).toHaveBeenCalledTimes(2); expect(fake.mock.calls[0]![0]).toContain(primary); expect(fake.mock.calls[1]![0]).toContain(fallback);
    expect((await quota.status()).text).toBe('exhausted');
    await expect(generateLawyerResult(job,config,false,quota)).rejects.toMatchObject({reasonCode:'quota_exhausted'}); expect(fake).toHaveBeenCalledTimes(2);
    const reset=Number(await redis.get(quota.key(primary))); const [seconds,micros]=await redis.time();
    expect(reset).toBe(nextQuotaReset(Number(seconds)*1000+Math.floor(Number(micros)/1000)));
    expect(await redis.pttl(quota.key(primary))).toBeGreaterThan(0);
    await redis.del(quota.key(fallback)); expect((await quota.status()).text).toBe('fallback');
    fake.mockResolvedValueOnce(new Response('{}',{status:503}));
    await expect(generateLawyerResult(job,config,false,quota)).rejects.toMatchObject({reasonCode:'provider_unavailable'});
    expect(fake).toHaveBeenCalledTimes(3); expect(fake.mock.calls[2]![0]).toContain(fallback);
    const demo=new QuotaStore(redis,{...config,JUDGE_AI_MODE:'demo'}); await demo.mark(fallback);
    expect(await demo.status()).toEqual({text:'ok',voice:'ok',resetsAt:null}); expect(await redis.exists(quota.key(fallback))).toBe(0);
    const injectedDemo=new QuotaStore(redis,{...config,JUDGE_AI_MODE:'demo',AI_QUOTA_E2E:true});
    expect((await injectedDemo.status()).text).toBe('fallback');
    await injectedDemo.mark(fallback);expect(await redis.exists(quota.key(fallback))).toBe(0);
    await redis.pexpire(quota.key(primary),0); expect((await quota.status()).text).toBe('ok');
  } finally { await redis.del(quota.key(primary),quota.key(fallback)); redis.disconnect(); }
});
it.each([false,true])('room limits count invalid joins, separate IPs, trustProxy=%s', async(trustProxy)=>{
  const redis=await connectedRedis(), prefix=`test:limits:${randomUUID()}`;
  const app=buildApp({redis,db:workingDb,session:testSession(),trustProxy,limits:{create:1,join:1,prefix}});
  try {
    const join=(forwarded:string,remoteAddress='192.0.2.1')=>app.inject({method:'POST',url:'/api/rooms/join',remoteAddress,headers:{'x-forwarded-for':forwarded},payload:{name:'Ann',code:'bad'}});
    expect((await join('198.51.100.1')).statusCode).toBe(400);
    const response=await join('198.51.100.2'); expect(response.statusCode).toBe(trustProxy?400:429);
    const limited=await join('198.51.100.1'); expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({error:{code:'ROOM_RATE_LIMITED'},retryAfterSeconds:expect.any(Number)});
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(3500);
    expect((await join('198.51.100.3','192.0.2.2')).statusCode).toBe(400);
    const created=await app.inject({method:'POST',url:'/api/rooms',payload:{}});expect(created.statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/api/rooms',payload:{}})).json().error.code).toBe('ROOM_RATE_LIMITED');
    const keys=await redis.keys(`${prefix}:*`); for(const key of keys)expect(await redis.ttl(key)).toBeGreaterThan(3500);
  } finally { await app.close(); const keys=await redis.keys(`${prefix}:*`); if(keys.length)await redis.del(...keys);redis.disconnect(); }
});
it('successful create/join also consume limits; public status exposes only fixed status and reset', async()=>{
  const redis=await connectedRedis(), prefix=`test:limits:${randomUUID()}`, model=`quota-${randomUUID()}`;
  const ai=loadAiConfig({JUDGE_AI_MODE:'auto',GEMINI_MODEL:model}), quota=new QuotaStore(redis,ai);
  const app=buildApp({redis,db:workingDb,session:testSession(),ai,limits:{create:1,join:1,prefix}});
  const a=newPlayerId(),b=newPlayerId(),keys=[`player:${a}`,`player:${b}`,quota.key(model)];
  const cookies=async(id:string)=>({quarrel_access:await signAccessToken(id,secretKey(TEST_SECRET))});
  try {
    await quota.mark(model);
    const status=await app.inject('/api/ai/status');expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({text:'exhausted',voice:'ok',resetsAt:expect.any(String)});
    expect(status.body).not.toContain(model);
    const created=await app.inject({method:'POST',url:'/api/rooms',cookies:await cookies(a),payload:{name:'Ann',topic:'Garden'}});
    expect(created.statusCode).toBe(200);const room=created.json().room; keys.push(`room:${room.roomId}`,`code:${room.code}`);
    expect((await app.inject({method:'POST',url:'/api/rooms',cookies:await cookies(a),payload:{name:'Ann',topic:'Another'}})).statusCode).toBe(429);
    expect((await app.inject({method:'POST',url:'/api/rooms/join',cookies:await cookies(b),payload:{name:'Bo',code:room.code}})).statusCode).toBe(200);
    expect((await app.inject({method:'POST',url:'/api/rooms/join',cookies:await cookies(b),payload:{name:'Bo',code:room.code}})).statusCode).toBe(429);
  } finally {await app.close();const counters=await redis.keys(`${prefix}:*`);await redis.del(...keys,...counters);redis.disconnect()}
});
