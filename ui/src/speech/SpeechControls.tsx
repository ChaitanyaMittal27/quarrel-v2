import { useContext } from 'react'
import { SpeechContext } from './context'
import type { SpeechItem } from '@quarrel/shared/contract'

export function SpeechButton({item,active,disabled,onPlay,onStop}:{item:SpeechItem;active:boolean;disabled:boolean;onPlay:()=>void;onStop:()=>void}) {
  return <span className="game-speech-control">{item.speechBlocked ? <span>Not available</span> : <button type="button" disabled={disabled && !active} aria-label={`${active?'Stop':'Play'} ${item.kind}`} onClick={active?onStop:onPlay}>{active?'Stop':'Play'}</button>}</span>
}
export function SpeechControls({item}:{item:SpeechItem|undefined}) {
  const context=useContext(SpeechContext)
  if(!context || !item)return null
  const {playback,audio}=context
  return <SpeechButton item={item} active={playback.active?.speechId===item.speechId} disabled={context.ai.voice === 'off' || !audio.preferences.enabled||audio.preferences.muted||audio.preferences.volume===0}
    onPlay={()=>context.play(item.speechId)} onStop={context.stop}/>
}

export function SpeechPlaybackNotice(){const c=useContext(SpeechContext);return c?.playback.error?<p className="game-field-error" role="alert">{c.playback.error}</p>:null}
