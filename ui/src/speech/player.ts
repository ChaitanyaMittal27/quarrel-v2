import type { RoomSnapshot, SpeechItem } from '@quarrel/shared/contract'
import { availableAi, type AiStatus } from '@quarrel/shared/contract'
import { requestSpeech, SpeechAudioError } from '../lib/api'
import { humanError } from '../game/errors'
import { defaultAudioPreferences, type AudioPreferences } from './preferences'

export interface Playback { status:'idle'|'loading'|'speaking'; active:SpeechItem|null; source:'server'|'browser'|null; error:string|null }
export interface PlaybackEvents { start:()=>void; end:()=>void; error:()=>void }
export interface PlaybackEngine {
  audio:(blob:Blob,preferences:AudioPreferences,events:PlaybackEvents)=>()=>void
  browser:(item:SpeechItem,preferences:AudioPreferences,events:PlaybackEvents)=>()=>void
}
export function browserEngine(): PlaybackEngine {
  return {
    audio(blob,prefs,events) {
      const url=URL.createObjectURL(blob)
      let audio:HTMLAudioElement
      try { audio=new Audio(url) } catch(error) { URL.revokeObjectURL(url); throw error }
      audio.volume=prefs.volume; audio.playbackRate=prefs.speed
      audio.onplaying=events.start; audio.onended=events.end; audio.onerror=events.error
      const release=() => { audio.onplaying=null; audio.onended=null; audio.onerror=null; audio.pause(); audio.src=''; URL.revokeObjectURL(url) }
      try { void audio.play().catch(events.error) } catch(error) { release();throw error }
      return release
    },
    browser(item,prefs,events) {
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('Browser voice unavailable')
      const utterance=new SpeechSynthesisUtterance(item.text), synth=window.speechSynthesis
      utterance.lang='en-US'; utterance.pitch=item.voice.browserVoice.pitch; utterance.rate=Math.min(10,Math.max(.1,item.voice.browserVoice.rate*prefs.speed)); utterance.volume=prefs.volume
      const voices=synth.getVoices(); utterance.voice=voices.find((v)=>v.lang.toLowerCase().startsWith('en')) ?? voices[0] ?? null
      utterance.onstart=events.start; utterance.onend=events.end; utterance.onerror=events.error
      const release=() => { utterance.onstart=null; utterance.onend=null; utterance.onerror=null; synth.cancel() }
      try { synth.cancel(); synth.speak(utterance) } catch(error) { release();throw error }
      return release
    },
  }
}
/** Sole playback owner. Never submits gameplay actions or controls a debate clock. */
export class SpeechPlayer {
  private ai: AiStatus = availableAi
  private state: Playback={status:'idle',active:null,source:null,error:null}
  private preferences={...defaultAudioPreferences}
  private items=new Map<string,SpeechItem>()
  private seen=new Set<string>()
  private queue:string[]=[]
  private debateId:string|undefined
  private roomId=''
  private unlocked=false
  private timer:ReturnType<typeof setTimeout>|undefined
  private generation=0
  private abort:AbortController|undefined
  private cleanup:(()=>void)|undefined
  private readonly changed:(state:Playback)=>void
  private readonly engine:PlaybackEngine
  private readonly request:typeof requestSpeech
  private readonly sessionError:((error:unknown)=>void)|undefined
  constructor(changed:(state:Playback)=>void,engine=browserEngine(),request=requestSpeech,sessionError?:((error:unknown)=>void)) {this.changed=changed;this.engine=engine;this.request=request;this.sessionError=sessionError}
  private emit(patch:Partial<Playback>) { this.state={...this.state,...patch}; this.changed(this.state) }
  private enabled() { return this.ai.voice !== 'off' && this.preferences.enabled && !this.preferences.muted && this.preferences.volume>0 }
  update(room:RoomSnapshot|null,preferences:AudioPreferences,ai:AiStatus=availableAi) {
    this.ai=ai
    this.preferences={...preferences}
    if (this.debateId!==room?.debateId) {
      this.stop(); this.debateId=room?.debateId; this.seen=new Set(room?.speech.map((s)=>s.speechId))
    }
    this.roomId=room?.roomId ?? ''; this.items=new Map(room?.speech.map((s)=>[s.speechId,s]))
    if (!preferences.autoplay) this.queue=[]
    if (this.state.active && (!this.items.has(this.state.active.speechId) || this.items.get(this.state.active.speechId)?.speechBlocked)) this.stop()
    for (const item of room?.speech ?? []) if (!this.seen.has(item.speechId)) {
      this.seen.add(item.speechId)
      if (this.preferences.autoplay && this.enabled() && !item.speechBlocked) this.queue.push(item.speechId)
    }
    if (!room || !this.enabled()) this.stop()
    else this.pump()
  }
  interact() { this.unlocked=true; this.pump() }
  private pump() {
    if (!this.unlocked || !this.preferences.autoplay || !this.enabled() || this.state.status!=='idle') return
    const id=this.queue.shift(); if (id) void this.start(id)
  }
  stop() {
    this.generation++; clearTimeout(this.timer); this.abort?.abort(); this.abort=undefined; this.cleanup?.(); this.cleanup=undefined; this.queue=[]
    this.emit({status:'idle',active:null,source:null,error:null})
  }
  play(id:string) { this.unlocked=true; this.stop(); return this.start(id) }
  private finish(error:string|null=null) {
    this.generation++; clearTimeout(this.timer); this.cleanup?.(); this.cleanup=undefined; this.abort=undefined
    this.emit({status:'idle',active:null,source:null,error}); this.pump()
  }
  private async start(id:string) {
    const item=this.items.get(id)
    if (!item || item.speechBlocked || !this.enabled()) { this.pump(); return }
    const generation=++this.generation, prefs={...this.preferences}
    this.abort=new AbortController(); this.emit({status:'loading',active:item,source:null,error:null})
    this.timer=setTimeout(()=>{if(generation===this.generation){this.abort?.abort();this.finish('Voice took too long to start. Please try again.')}},35000)
    const events:PlaybackEvents={start:()=>{if(generation===this.generation){clearTimeout(this.timer);this.emit({status:'speaking'})}},
      end:()=>{if(generation===this.generation)this.finish()},error:()=>{if(generation===this.generation)this.finish('Speech could not play. You can try again or keep reading.')}}
    try {
      let release:()=>void
      try {
        const blob=await this.request(this.roomId,id,this.abort.signal)
        if(generation!==this.generation)return
        this.emit({source:'server'}); release=this.engine.audio(blob,prefs,events)
      } catch(error) {
        if(generation!==this.generation)return
        if(error instanceof SpeechAudioError && ['UNAUTHENTICATED','SESSION_EXPIRED'].includes(error.code)) {this.queue=[];this.sessionError?.(error)}
        if(!(error instanceof SpeechAudioError && error.fallbackAllowed && prefs.browserFallback)) { this.finish(humanError(error)); return }
        this.emit({source:'browser'}); release=this.engine.browser(item,prefs,events)
      }
      if(generation===this.generation)this.cleanup=release; else release()
    } catch { if(generation===this.generation)this.finish('Voice is unavailable in this browser. You can keep reading.') }
  }
  dispose() { this.stop(); this.items.clear(); this.seen.clear() }
}
