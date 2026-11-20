import { useEffect, useRef, useState } from 'react'
import type { RoomSnapshot } from '@quarrel/shared/contract'
import { SpeechPlayer, type Playback } from './player'
import { loadAudioPreferences, saveAudioPreferences, type AudioPreferences } from './preferences'

export function useSpeech(room:RoomSnapshot|null,onSessionError?:(error:unknown)=>void) {
  const [audio,setAudio]=useState(loadAudioPreferences)
  const [playback,setPlayback]=useState<Playback>({status:'idle',active:null,source:null,error:null})
  const player=useRef<SpeechPlayer|null>(null)
  useEffect(()=>{
    let active=true
    const instance=new SpeechPlayer((s)=>{if(active)setPlayback(s)},undefined,undefined,onSessionError); player.current=instance
    const interact=()=>instance.interact()
    document.addEventListener('pointerdown',interact); document.addEventListener('keydown',interact)
    return ()=>{active=false;document.removeEventListener('pointerdown',interact);document.removeEventListener('keydown',interact);instance.dispose();player.current=null}
  },[onSessionError])
  useEffect(()=>{player.current?.update(room,audio.preferences)},[room,audio.preferences])
  return {playback,audio,play:(id:string)=>player.current?.play(id),stop:()=>player.current?.stop(),
    setPreferences:(preferences:AudioPreferences)=>setAudio({preferences,storageAvailable:saveAudioPreferences(preferences)})}
}
