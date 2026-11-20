import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testApp, TEST_SECRET, type TestApp } from './helpers';
import { newPlayerId, secretKey, signAccessToken } from '../common/tokens';
import { loadTtsConfig } from '../common/config';
import { SpeechError, pcmToWav, type generateSpeech } from '../worker/ai/speech-provider';
import { SpeechRepo } from '../speech/speech-repo';
import { SpeechService } from '../speech/speech-service';

const config=loadTtsConfig({JUDGE_AI_MODE:'auto',GEMINI_TTS_API_KEY:'fake-tts-key',TTS_TIMEOUT_MS:'1000'});
const wav=pcmToWav(new Uint8Array([0,0,1,0]));
const generate=vi.fn<typeof generateSpeech>();
type Player={id:string;cookies:{quarrel_access:string}};
let t:TestApp,a:Player,b:Player,roomId:string,debateId:string,prefix:string;
const keys=new Set<string>();
beforeEach(async()=>{
  prefix=`tts:test-${randomBytes(8).toString('hex')}`;generate.mockReset().mockResolvedValue(wav);
  t=await testApp({speech:{config,generate,prefix}});
  const player=async()=>{const id=newPlayerId();keys.add(`player:${id}`);return {id,cookies:{quarrel_access:await signAccessToken(id,secretKey(TEST_SECRET))}}};
  a=await player();b=await player();
  const created=await t.app.inject({method:'POST',url:'/api/rooms',cookies:a.cookies,payload:{name:'Ann',topic:'A shared garden',durationSec:120}});
  const room=created.json().room;roomId=room.roomId;debateId=room.debateId;
  keys.add(`room:${roomId}`);keys.add(`code:${room.code}`);keys.add(`room:${roomId}:messages`);
  await t.app.inject({method:'POST',url:'/api/rooms/join',cookies:b.cookies,payload:{name:'Bo',code:room.code}});
  await t.redis.hset(`room:${roomId}`,'a.lawyerId','detective-arden','b.lawyerId','jungle-tavi','a.drafts','[{"text":"PRIVATE DRAFT"}]','b.consultations','[{"question":"PRIVATE QUESTION"}]','workText','PRIVATE WORK');
  for(const [index,kind,slot,text] of [[1,'announcement',null,'Subtopic begins.'],[2,'argument','A','A public presentation.'],[3,'argument','B','B public presentation.'],[4,'judge_summary',null,'A summary of public points.']] as const)
    await t.redis.rpush(`room:${roomId}:messages`,JSON.stringify({id:`m_${index}`,ordinal:1,kind,slot,text,source:'demo',at:Date.now()}));
});
afterEach(async()=>{vi.useRealTimers();const speechKeys=await t.redis.keys(`${prefix}:*`);if(speechKeys.length)await t.redis.del(...speechKeys);if(keys.size)await t.redis.del(...keys);keys.clear();await t.close();vi.restoreAllMocks()});
const id=(n:number|string)=>`${debateId}:m_${n}`;
const post=(speechId=id(2),who=a,payload:Record<string,unknown>={speechId})=>t.app.inject({method:'POST',url:`/api/rooms/${roomId}/speech`,cookies:who.cookies,payload});
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>((r)=>{resolve=r});return{promise,resolve}};

describe('Stage 9 canonical speech authorization',()=>{
  it('rules 8.1,8.3: selects complete public items only, chosen lawyer voices and theme judge for summary/announcement/verdict',async()=>{
    await t.redis.hset(`room:${roomId}`,'verdict',JSON.stringify({text:'The public verdict.'}));
    const items=await new SpeechRepo(t.redis,prefix).items(a.id,roomId);
    expect(items.map((s)=>s.kind)).toEqual(['announcement','argument','argument','summary','verdict']);
    expect(items[1]!.voice).toEqual({geminiVoice:'Charon',browserVoice:{pitch:.9,rate:.9}});
    expect(items[2]!.voice.geminiVoice).toBe('Puck');
    for(const item of [items[0]!,items[3]!,items[4]!])expect(item.voice.geminiVoice).toBe('Kore');
    expect(JSON.stringify(items)).not.toContain('PRIVATE');
    for(const [i,item] of items.entries()){const r=await post(item.speechId);expect(r.statusCode).toBe(200);expect(generate.mock.calls[i]![0]).toEqual({text:item.text,voice:item.voice.geminiVoice})}
  });
  it('rule 8.2: session, seat, strict body, stale room and unknown/private ID checks fail without fallback',async()=>{
    const noCookie=await t.app.inject({method:'POST',url:`/api/rooms/${roomId}/speech`,payload:{speechId:id(2)}});
    expect(noCookie.statusCode).toBe(401);expect(noCookie.json().fallbackAllowed).toBe(false);
    const expired={...a,cookies:{quarrel_access:await signAccessToken(a.id,secretKey(TEST_SECRET),new Date(Date.now()-1000000))}};
    expect((await post(id(2),expired)).json().error.code).toBe('SESSION_EXPIRED');
    expect((await post(id(2),a,{speechId:id(2),text:'forged'})).statusCode).toBe(400);
    for(const speechId of [id('private'),`${debateId}:verdict`]){const r=await post(speechId);expect(r.json()).toMatchObject({error:{code:'SPEECH_NOT_FOUND'},fallbackAllowed:false})}
    await t.redis.set(`player:${a.id}`,'another-room');expect((await post()).json().error.code).toBe('STALE_ROOM');
    await t.redis.del(`player:${a.id}`);expect((await post()).json().error.code).toBe('ROOM_NOT_FOUND');
    await t.redis.set(`player:${a.id}`,roomId);await t.redis.hset(`room:${roomId}`,'a.left','1');expect((await post()).json().error.code).toBe('ROOM_NOT_FOUND');
    expect(generate).not.toHaveBeenCalled();
  });
  it('rules 8.3,8.4: blocked items reject 422; overdue clocks/hash/version/messages remain unchanged',async()=>{
    await t.redis.hset(`room:${roomId}`,'phase','debate','state','composing','deadline','1','activeSlot','A','a.remainingMs','10','b.remainingMs','10');
    await t.redis.rpush(`room:${roomId}:messages`,JSON.stringify({id:'unsafe',kind:'argument',slot:'A',text:'I will hurt you',ordinal:1,at:Date.now()}));
    const before=await t.redis.hgetall(`room:${roomId}`),messages=await t.redis.lrange(`room:${roomId}:messages`,0,-1);
    const blocked=await post(`${debateId}:unsafe`);expect(blocked.statusCode).toBe(422);expect(blocked.json().fallbackAllowed).toBe(false);expect(generate).not.toHaveBeenCalled();
    expect((await post()).statusCode).toBe(200);
    expect(await t.redis.hgetall(`room:${roomId}`)).toEqual(before);expect(await t.redis.lrange(`room:${roomId}:messages`,0,-1)).toEqual(messages);
    await t.redis.hset(`room:${roomId}`,'expiresAt','1');expect((await post()).json().error.code).toBe('ROOM_EXPIRED');
  });
});
describe('Stage 9 Redis generation state',()=>{
  it('rule 8.5: cache hit skips generation, WAV is playable and cache expires after 15 minutes',async()=>{
    const first=await post();expect(first.headers['content-type']).toBe('audio/wav');expect(first.rawPayload).toEqual(Buffer.from(wav));
    expect((await post(id(2),b)).rawPayload).toEqual(Buffer.from(wav));expect(generate).toHaveBeenCalledTimes(1);
    const cache=(await t.redis.keys(`${prefix}:audio:*`))[0]!;expect(await t.redis.pttl(cache)).toBeGreaterThan(890000);
    await t.redis.del(cache);await post();expect(generate).toHaveBeenCalledTimes(2);
  });
  it('rule 8.5: eight generations per player window; hits and shared waiters do not charge it',async()=>{
    for(let n=10;n<19;n++)await t.redis.rpush(`room:${roomId}:messages`,JSON.stringify({id:`m_${n}`,kind:'argument',slot:'A',text:`Public words ${n}`,ordinal:1,at:1}));
    for(let n=10;n<18;n++)expect((await post(id(n))).statusCode).toBe(200);
    const limited=await post(id(18));expect(limited.statusCode).toBe(429);expect(limited.json()).toMatchObject({error:{code:'SPEECH_RATE_LIMITED'},fallbackAllowed:true});
    expect(await t.redis.pttl(`${prefix}:rate:${a.id}`)).toBeGreaterThan(55000);
    expect((await post(id(10))).statusCode).toBe(200);expect(generate).toHaveBeenCalledTimes(8);
  });
  it('rule 8.5: four global leases cap generation across service instances, and finishes release them',async()=>{
    const entered=deferred<void>(),finish=deferred<Uint8Array>();generate.mockImplementation(()=>{if(generate.mock.calls.length===4)entered.resolve();return finish.promise});
    const pending=[1,2,3,4].map((n)=>post(id(n)).then((r)=>r));await entered.promise;
    await t.redis.rpush(`room:${roomId}:messages`,JSON.stringify({id:'extra',kind:'announcement',slot:null,text:'Extra public words',ordinal:1,at:1}));
    const busy=await post(`${debateId}:extra`,b);expect(busy.json()).toMatchObject({error:{code:'SPEECH_BUSY'},fallbackAllowed:true});
    finish.resolve(wav);expect((await Promise.all(pending)).every((r)=>r.statusCode===200)).toBe(true);expect(await t.redis.zcard(`${prefix}:inflight`)).toBe(0);
  });
  it('rule 8.5: identical concurrent requests share one generation across separate API service objects',async()=>{
    const entered=deferred<void>(),finish=deferred<Uint8Array>(),waiting=deferred<void>();generate.mockImplementation(()=>{entered.resolve();return finish.promise});
    const repo=new SpeechRepo(t.redis,prefix),first=new SpeechService(repo,config,generate).speak(a.id,roomId,id(2));await entered.promise;
    const second=new SpeechService(new SpeechRepo(t.redis,prefix),config,generate,{wait:async()=>{waiting.resolve();await first}}).speak(b.id,roomId,id(2));
    await waiting.promise;finish.resolve(wav);expect(await first).toEqual(await second);expect(generate).toHaveBeenCalledTimes(1);expect(await t.redis.get(`${prefix}:rate:${b.id}`)).toBeNull();
  });
  it('rule 8.5: cache cap skips large audio; missing lock falls back; stale release cannot unlock a newer owner',async()=>{
    const repo=new SpeechRepo(t.redis,prefix),service=new SpeechService(repo,{...config,TTS_CACHE_MAX_BYTES:1},generate);
    await service.speak(a.id,roomId,id(2));await service.speak(a.id,roomId,id(2));expect(generate).toHaveBeenCalledTimes(2);expect(await t.redis.keys(`${prefix}:audio:*`)).toHaveLength(0);
    await repo.reserve('lease',a.id,'old',23000);await t.redis.del(`${prefix}:lock:lease`);await t.redis.zadd(`${prefix}:inflight`,0,'old');
    expect(await repo.reserve('lease',b.id,'new',23000)).toBe('OWN');await repo.release('lease','old',wav);expect(await t.redis.get(`${prefix}:lock:lease`)).toBe('new');expect(await repo.cache('lease')).toBeNull();await repo.release('lease','new');
    const waitingService=new SpeechService(repo,config,generate,{wait:async()=>{}});
    const original=vi.spyOn(repo,'reserve').mockResolvedValue('WAIT');await expect(waitingService.speak(a.id,roomId,id(2))).rejects.toMatchObject({code:'SPEECH_BUSY'});original.mockRestore();
  });
  it('rule 8.5: waiters poll beyond 500ms and receive the cached audio without generating',async()=>{
    const repo=new SpeechRepo(t.redis,prefix);let elapsed=0;
    vi.spyOn(repo,'reserve').mockResolvedValue('WAIT');
    vi.spyOn(repo,'locked').mockResolvedValue(true);
    vi.spyOn(repo,'cache').mockImplementation(async()=>elapsed>=1400?Buffer.from(Buffer.from(wav).toString('base64')):null);
    const wait=vi.fn(async(ms:number)=>{elapsed+=ms});
    expect(await new SpeechService(repo,config,generate,{wait,now:()=>elapsed}).speak(a.id,roomId,id(2))).toEqual(Buffer.from(wav));
    expect(wait).toHaveBeenCalledTimes(7);expect(wait).toHaveBeenCalledWith(200);expect(generate).not.toHaveBeenCalled();
  });
  it('rule 8.5: waiters stop at timeout plus one second or when the lock disappears',async()=>{
    const repo=new SpeechRepo(t.redis,prefix);let elapsed=0;
    vi.spyOn(repo,'reserve').mockResolvedValue('WAIT');vi.spyOn(repo,'locked').mockResolvedValue(true);
    const wait=vi.fn(async(ms:number)=>{elapsed+=ms});
    const service=new SpeechService(repo,config,generate,{wait,now:()=>elapsed});
    await expect(service.speak(a.id,roomId,id(2))).rejects.toMatchObject({code:'SPEECH_BUSY',fallbackAllowed:true});
    expect(elapsed).toBe(2000);expect(wait).toHaveBeenCalledTimes(10);
    elapsed=0;wait.mockClear();vi.mocked(repo.locked).mockImplementation(async()=>elapsed<400);
    await expect(service.speak(a.id,roomId,id(2))).rejects.toMatchObject({code:'SPEECH_BUSY',fallbackAllowed:true});
    expect(elapsed).toBe(400);expect(generate).not.toHaveBeenCalled();
  });
  it('rule 8.5: a release between the cache and lock reads still returns audio',async()=>{
    const repo=new SpeechRepo(t.redis,prefix);
    vi.spyOn(repo,'reserve').mockResolvedValue('HIT');vi.spyOn(repo,'locked').mockResolvedValue(false);
    vi.spyOn(repo,'cache').mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(Buffer.from(Buffer.from(wav).toString('base64')));
    expect(await new SpeechService(repo,config,generate).speak(a.id,roomId,id(2))).toEqual(Buffer.from(wav));expect(generate).not.toHaveBeenCalled();
  });
  it('rules 8.6,8.7: missing key/demo skip provider; provider failures are fixed codes and release leases',async()=>{
    for(const c of [{...config,GEMINI_TTS_API_KEY:undefined},{...config,JUDGE_AI_MODE:'demo' as const}])await expect(new SpeechService(new SpeechRepo(t.redis,prefix),c,generate).speak(a.id,roomId,id(2))).rejects.toMatchObject({code:'SPEECH_UNAVAILABLE',fallbackAllowed:true});
    expect(generate).not.toHaveBeenCalled();
    for(const [error,code,allowed] of [[new Error('PRIVATE PROVIDER BODY'),'SPEECH_PROVIDER_ERROR',true],[new SpeechError(422,'TTS_CONTENT_BLOCKED','provider'),'SPEECH_BLOCKED',false],[new SpeechError(429,'TTS_QUOTA','provider'),'SPEECH_RATE_LIMITED',true]] as const){generate.mockRejectedValueOnce(error);const r=await post();expect(r.json()).toMatchObject({error:{code},fallbackAllowed:allowed});expect(r.body).not.toContain('provider');expect(r.body).not.toContain('PRIVATE');expect(await t.redis.zcard(`${prefix}:inflight`)).toBe(0)}
    await t.redis.rpush(`room:${roomId}:messages`,JSON.stringify({id:'long',kind:'argument',slot:'A',text:'x'.repeat(4001),ordinal:1,at:1}));expect((await post(`${debateId}:long`)).json()).toMatchObject({error:{code:'SPEECH_INVALID_TEXT'},fallbackAllowed:false});
  });
  it('rule 8.6: timeout releases the global lease and lock even if a fake ignores abort',async()=>{
    const entered=deferred<void>();generate.mockImplementation(()=>{vi.useFakeTimers();entered.resolve();return new Promise(()=>{})});
    const pending=new SpeechService(new SpeechRepo(t.redis,prefix),config,generate).speak(a.id,roomId,id(2)).catch((e:unknown)=>e);await entered.promise;await vi.advanceTimersByTimeAsync(1001);expect(await pending).toMatchObject({status:504,code:'SPEECH_TIMEOUT'});expect(await t.redis.zcard(`${prefix}:inflight`)).toBe(0);expect(await t.redis.keys(`${prefix}:lock:*`)).toHaveLength(0);
  });
});
