import { Children,createElement,isValidElement,type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach,describe,expect,it,vi } from 'vitest'
import type { RoomSnapshot,SpeechItem } from '@quarrel/shared/contract'
import { SpeechPlayer,browserEngine,type Playback,type PlaybackEvents } from '../src/speech/player'
import { defaultAudioPreferences,loadAudioPreferences,saveAudioPreferences,audioPreferencesKey } from '../src/speech/preferences'
import { SpeechAudioError,requestSpeech } from '../src/lib/api'
import { SpeechButton, SpeechControls } from '../src/speech/SpeechControls'
import { SpeechContext } from '../src/speech/context'
import { AudioSettingsForm } from '../src/speech/AudioSettings'
import { RoomStage } from '../src/components/art/RoomStage'
import { defaultDisplayPreferences } from '../src/settings/display-preferences'

const item:SpeechItem={speechId:'d_AAAAAAAAAAAAAAAAAAAAAA:m_1',text:'A public presentation.',kind:'argument',slot:'A',speechBlocked:false,voice:{geminiVoice:'Puck',browserVoice:{pitch:1.08,rate:1}}}
const room:RoomSnapshot={roomId:'r_AAAAAAAAAAAAAAAAAAAAAA',debateId:'d_AAAAAAAAAAAAAAAAAAAAAA',archivedAt:null,rematch:{A:false,B:false},code:'ABC234',version:1,
 createdAt:'2030-01-01T00:00:00Z',expiresAt:'2030-01-02T00:00:00Z',serverNow:'2030-01-01T00:00:01Z',closed:false,bothReady:true,you:{slot:'A'},
 setup:{phase:'waiting',theme:'courtroom',topic:'Topic',durationSec:120,positions:{A:null,B:null}},plan:null,startsAt:null,debate:null,messages:[],speech:[item],summaries:[],summary:null,jury:null,verdict:null,
 players:[{slot:'A',name:'Ann',characterId:'jungle-lion',lawyerId:'courtroom-emery',ready:true,connected:true,left:false}]}
const blob=new Blob(['wav'],{type:'audio/wav'}),prefs={...defaultAudioPreferences}
const settle=async()=>{await Promise.resolve();await Promise.resolve()}
const players:SpeechPlayer[]=[]
function harness(){
 const changes:Playback[]=[],events:PlaybackEvents[]=[],release=vi.fn()
 const engine={audio:vi.fn((_b:Blob,_p:typeof prefs,e:PlaybackEvents)=>{events.push(e);return release}),browser:vi.fn((_i:SpeechItem,_p:typeof prefs,e:PlaybackEvents)=>{events.push(e);return release})}
 const request=vi.fn<typeof requestSpeech>().mockResolvedValue(blob),player=new SpeechPlayer((s)=>changes.push(s),engine,request)
 players.push(player);player.update(room,prefs);return{player,changes,events,release,engine,request}
}
afterEach(()=>{players.splice(0).forEach((p)=>p.dispose());vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('Stage 9 playback controller',()=>{
 it('quota voice-off disables the actual play control even when audio preferences allow playback',()=>{
  const markup=renderToStaticMarkup(createElement(SpeechContext.Provider,{value:{ai:{text:'ok',voice:'off',resetsAt:'2030-01-02T08:00:00Z'},audio:{preferences:prefs,storageAvailable:true},playback:{status:'idle',active:null,source:null,error:null},play:()=>{},stop:()=>{},setPreferences:()=>{}}},createElement(SpeechControls,{item})));
  expect(markup).toContain('aria-label="Play argument"');expect(markup).toContain('disabled=""');
 });
 it('daily voice exhaustion stops playback and prevents both engines even with browser fallback enabled',async()=>{
  const h=harness();await h.player.play(item.speechId);h.events[0]!.start();
  h.player.update(room,prefs,{text:'ok',voice:'off',resetsAt:'2030-01-02T08:00:00Z'});
  expect(h.release).toHaveBeenCalledOnce();await h.player.play(item.speechId);expect(h.request).toHaveBeenCalledTimes(1);expect(h.engine.browser).not.toHaveBeenCalled();
  h.player.update(room,prefs);await h.player.play(item.speechId);expect(h.request).toHaveBeenCalledTimes(2);
  h.request.mockRejectedValue(new SpeechAudioError('SPEECH_UNAVAILABLE',false));await h.player.play(item.speechId);expect(h.engine.browser).not.toHaveBeenCalled();
 })
 it('server audio first; animation follows start/end events; stop releases audio without changing the room',async()=>{
  const h=harness(),before=JSON.stringify(room);await h.player.play(item.speechId)
  expect(h.request).toHaveBeenCalledWith(room.roomId,item.speechId,expect.any(AbortSignal));expect(h.engine.browser).not.toHaveBeenCalled();expect(h.changes.at(-1)!.status).toBe('loading')
  h.events[0]!.start();expect(h.changes.at(-1)).toMatchObject({status:'speaking',source:'server',active:{slot:'A'}})
  h.events[0]!.end();expect(h.changes.at(-1)!.active).toBeNull();expect(h.release).toHaveBeenCalledOnce()
  await h.player.play(item.speechId);h.events[1]!.start();h.player.stop();expect(h.changes.at(-1)!.status).toBe('idle');expect(JSON.stringify(room)).toBe(before)
 })
 it('browser fallback only on an explicit allowed error and enabled preference; blocked and unauthorized never speak',async()=>{
  const h=harness();h.request.mockRejectedValue(new SpeechAudioError('SPEECH_UNAVAILABLE',true));await h.player.play(item.speechId);expect(h.engine.browser).toHaveBeenCalledOnce();h.events[0]!.start();expect(h.changes.at(-1)!.source).toBe('browser')
  h.player.stop();h.player.update(room,{...prefs,browserFallback:false});await h.player.play(item.speechId);expect(h.engine.browser).toHaveBeenCalledOnce()
  h.player.update(room,prefs);h.request.mockRejectedValue(new SpeechAudioError('SPEECH_BLOCKED',false));await h.player.play(item.speechId);expect(h.engine.audio).not.toHaveBeenCalled();expect(h.engine.browser).toHaveBeenCalledOnce()
  h.player.update({...room,speech:[{...item,speechBlocked:true}]},prefs);const count=h.request.mock.calls.length;await h.player.play(item.speechId);expect(h.request).toHaveBeenCalledTimes(count)
 })
 it('autoplay queues new items in order only after interaction, ignores restore history and skips blocked entries',async()=>{
  const h=harness();h.player.update({...room,speech:[]},{...prefs,autoplay:true})
  const second={...item,speechId:`${room.debateId}:m_2`,slot:null,kind:'summary' as const},blocked={...item,speechId:`${room.debateId}:m_3`,speechBlocked:true}
  h.player.update({...room,speech:[item,second,blocked]},{...prefs,autoplay:true});expect(h.request).not.toHaveBeenCalled()
  // The initial restored ID was already seen and must not replay. Only the newly arrived summary queues.
  h.player.interact();await settle();expect(h.request.mock.calls[0]![1]).toBe(second.speechId);h.events[0]!.start();h.events[0]!.end();expect(h.request).toHaveBeenCalledOnce()
  h.player.update({...room,speech:[item,second,{...item,speechId:`${room.debateId}:m_4`},{...second,speechId:`${room.debateId}:m_5`}]},{...prefs,autoplay:true});await settle();expect(h.request.mock.calls[1]![1]).toBe(`${room.debateId}:m_4`)
  h.events[1]!.end();await settle();expect(h.request.mock.calls[2]![1]).toBe(`${room.debateId}:m_5`)
 })
 it('late request completion, null/rematch snapshot, mute and voice off cannot resume stale audio',async()=>{
  const h=harness();let resolve!:(b:Blob)=>void;h.request.mockImplementation(()=>new Promise((r)=>{resolve=r}));const pending=h.player.play(item.speechId);h.player.update(null,prefs);resolve(blob);await pending;expect(h.engine.audio).not.toHaveBeenCalled()
  h.request.mockResolvedValue(blob);h.player.update(room,{...prefs,muted:true});await h.player.play(item.speechId);expect(h.engine.audio).not.toHaveBeenCalled()
  h.player.update(room,prefs);await h.player.play(item.speechId);h.player.update({...room,debateId:'d_BBBBBBBBBBBBBBBBBBBBBB',speech:[]},prefs);expect(h.release).toHaveBeenCalledOnce()
  h.player.update(room,{...prefs,enabled:false});await h.player.play(item.speechId);expect(h.engine.audio).toHaveBeenCalledOnce()
 })
 it('engine failures and a stalled start show human errors and release safely',async()=>{
  const h=harness();await h.player.play(item.speechId);h.events[0]!.error();expect(h.changes.at(-1)!.error).toContain('Speech could not play')
  h.request.mockRejectedValue(new SpeechAudioError('SPEECH_UNAVAILABLE',true));h.engine.browser.mockImplementationOnce(()=>{throw new Error('not supported')});await h.player.play(item.speechId);expect(h.changes.at(-1)!.error).toContain('unavailable in this browser')
  vi.useFakeTimers();h.request.mockImplementation(()=>new Promise(()=>{}));void h.player.play(item.speechId);await vi.advanceTimersByTimeAsync(35001);expect(h.changes.at(-1)!.error).toContain('too long')
 })
})
describe('Stage 9 browser adapter, controls and preferences',()=>{
 it('audio uses volume/speed, end/error events and URL cleanup; browser uses pitch/rate and never alters text',async()=>{
  class FakeAudio {volume=0;playbackRate=0;src='';onplaying:(()=>void)|null=null;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;play=vi.fn().mockResolvedValue(undefined);pause=vi.fn();constructor(){audios.push(this)}}
  class FakeUtterance {lang='';pitch=0;rate=0;volume=0;voice:unknown=null;onstart:(()=>void)|null=null;onend:(()=>void)|null=null;onerror:(()=>void)|null=null;constructor(public text:string){utterances.push(this)}}
  const audios:FakeAudio[]=[],utterances:FakeUtterance[]=[],synth={getVoices:()=>[{name:'Spanish',lang:'es'},{name:'English',lang:'en-US'}],cancel:vi.fn(),speak:vi.fn()}
  vi.stubGlobal('Audio',FakeAudio);vi.stubGlobal('SpeechSynthesisUtterance',FakeUtterance);vi.stubGlobal('window',{speechSynthesis:synth});const revoke=vi.fn();vi.stubGlobal('URL',{createObjectURL:()=> 'blob:voice',revokeObjectURL:revoke})
  const engine=browserEngine(),events={start:vi.fn(),end:vi.fn(),error:vi.fn()},release=engine.audio(blob,{...prefs,volume:.4,speed:1.5},events)
  expect(audios[0]).toMatchObject({volume:.4,playbackRate:1.5});audios[0]!.onplaying!();audios[0]!.onended!();release();expect(revoke).toHaveBeenCalledWith('blob:voice')
  const cancel=engine.browser(item,{...prefs,speed:1.5},events);expect(utterances[0]).toMatchObject({text:item.text,pitch:1.08,rate:1.5,volume:.8,voice:{name:'English'}});utterances[0]!.onstart!();utterances[0]!.onend!();cancel();expect(synth.cancel).toHaveBeenCalled()
 })
 it('guarded audio settings default autoplay off, validate ranges, and remain usable when storage fails',()=>{
  expect(loadAudioPreferences(()=>({getItem:()=>null,setItem:vi.fn()})).preferences.autoplay).toBe(false)
  expect(loadAudioPreferences(()=>{throw new Error('storage')}).storageAvailable).toBe(false)
  expect(loadAudioPreferences(()=>({getItem:()=>'{bad',setItem:vi.fn()})).preferences).toEqual(prefs)
  const setItem=vi.fn();expect(saveAudioPreferences(prefs,()=>({getItem:()=>null,setItem}))).toBe(true);expect(setItem).toHaveBeenCalledWith(audioPreferencesKey,JSON.stringify(prefs))
  expect(saveAudioPreferences({...prefs,volume:2},()=>({getItem:()=>null,setItem}))).toBe(false)
  const controls=(node:ReactNode):{children?:ReactNode;onClick?:()=>void;onChange?:(e:{target:{checked:boolean;value:string}})=>void}[]=>Children.toArray(node).flatMap((c)=>isValidElement<{children?:ReactNode}>(c)?[c.props,...controls(c.props.children)]:[])
  const change=vi.fn(),settings=AudioSettingsForm({preferences:prefs,storageAvailable:false,onChange:change});const inputs=controls(settings).filter((p)=>p.onChange);inputs[0]!.onChange!({target:{checked:false,value:''}});expect(change).toHaveBeenCalledWith({...prefs,enabled:false});expect(renderToStaticMarkup(settings)).toContain('Storage is unavailable')
  const onPlay=vi.fn(),onStop=vi.fn();controls(SpeechButton({item,active:false,disabled:false,onPlay,onStop})).find((c)=>c.onClick)!.onClick!();expect(onPlay).toHaveBeenCalledOnce();controls(SpeechButton({item,active:true,disabled:false,onPlay,onStop})).find((c)=>c.onClick)!.onClick!();expect(onStop).toHaveBeenCalledOnce();expect(renderToStaticMarkup(createElement(SpeechButton,{item:{...item,speechBlocked:true},active:false,disabled:false,onPlay,onStop}))).toContain('Not available')
 })
 it('lawyer/judge motion follows playback props; reduced motion pauses artwork without muting audio',()=>{
  const html=renderToStaticMarkup(createElement(RoomStage,{room,receivedAt:0,now:0,preferences:{...defaultDisplayPreferences,reducedMotion:'on'},speakingSlot:'A',judgeSpeaking:true}))
  expect(html).toContain('data-type="lawyer" data-state="speaking"');expect(html).toContain('data-type="judge" data-state="speaking"');expect(html).toContain('data-paused="true"')
 })
 it('the speech API sends only the ID, parses explicit fallback errors and rejects unknown responses closed',async()=>{
  const request=vi.fn<typeof fetch>();vi.stubGlobal('fetch',request)
  request.mockResolvedValueOnce(new Response(blob,{headers:{'Content-Type':'audio/wav'}}));expect((await requestSpeech(room.roomId,item.speechId)).size).toBeGreaterThan(0);expect(JSON.parse(request.mock.calls[0]![1]!.body as string)).toEqual({speechId:item.speechId})
  request.mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'SESSION_EXPIRED',message:'Expired'},fallbackAllowed:false}),{status:401})).mockResolvedValueOnce(new Response(null,{status:204})).mockResolvedValueOnce(new Response(blob,{headers:{'Content-Type':'audio/wav'}}))
  expect((await requestSpeech(room.roomId,item.speechId)).size).toBeGreaterThan(0);expect(request.mock.calls[2]![0]).toBe('/api/session/refresh')
  request.mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'SPEECH_UNAVAILABLE',message:'Unavailable'},fallbackAllowed:true}),{status:503}));await expect(requestSpeech(room.roomId,item.speechId)).rejects.toMatchObject({fallbackAllowed:true})
  request.mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'UNAUTHENTICATED',message:'Expired'}}),{status:401}));await expect(requestSpeech(room.roomId,item.speechId)).rejects.toMatchObject({fallbackAllowed:false})
  request.mockResolvedValueOnce(new Response('bad',{headers:{'Content-Type':'text/plain'}}));await expect(requestSpeech(room.roomId,item.speechId)).rejects.toMatchObject({fallbackAllowed:false})
 })
})
