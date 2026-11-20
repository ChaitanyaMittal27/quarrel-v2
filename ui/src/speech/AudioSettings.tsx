import { useContext } from 'react'
import type { AudioPreferences } from './preferences'
import { SpeechContext } from './context'

export function AudioSettingsForm({preferences:p,storageAvailable,onChange}:{preferences:AudioPreferences;storageAvailable:boolean;onChange:(p:AudioPreferences)=>void}) {
  return <section className="art-personal-settings"><h3>Voice on this browser</h3>
    {([{key:'enabled',label:'Voice on'},{key:'muted',label:'Mute'},{key:'autoplay',label:'Autoplay new public items'},{key:'browserFallback',label:'Use browser voice when needed'}] as const).map(({key,label})=><label className="art-check" key={key}><input type="checkbox" checked={p[key]} onChange={(e)=>onChange({...p,[key]:e.target.checked})}/>{label}</label>)}
    <label>Volume<input type="range" min="0" max="1" step=".05" value={p.volume} onChange={(e)=>onChange({...p,volume:Number(e.target.value)})}/></label>
    <label>Speed<input type="range" min=".5" max="2" step=".1" value={p.speed} onChange={(e)=>onChange({...p,speed:Number(e.target.value)})}/>{p.speed}x</label>
    <p>Autoplay begins only after you interact with the page. Audio never pauses debate clocks.</p>
    {!storageAvailable&&<p>Storage is unavailable. Voice settings still work in this tab.</p>}
  </section>
}
export function AudioSettings(){const c=useContext(SpeechContext);return c?<AudioSettingsForm {...c.audio} onChange={c.setPreferences}/>:null}
