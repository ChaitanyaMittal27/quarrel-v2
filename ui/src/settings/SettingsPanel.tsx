import { useId } from 'react'
import { playerCharacters, lawyers } from '@quarrel/shared/config'
import type { PlayerView } from '@quarrel/shared/contract'
import { AssetView } from '../components/art/AssetView'
import type { DisplayPreferences } from './display-preferences'
import type { ChoiceKind } from './choices'

export function SettingsPanel({ player, ended, busy, preferences, storageAvailable, onPick, onDisplay }: {
  player: PlayerView; ended: boolean; busy: boolean; preferences: DisplayPreferences; storageAvailable: boolean
  onPick: (kind: ChoiceKind, id: string) => void; onDisplay: (next: DisplayPreferences) => void
}) {
  const title = useId()
  return <section className="art-scope art-settings" data-motion-preference={preferences.reducedMotion}
    data-reduced-motion={preferences.reducedMotion === 'on'} aria-labelledby={title}>
    <h2 id={title}>Room settings</h2><p>You change only your own character and lawyer. Both players see your saved choices.</p>
    {ended && <p role="status">The debate has ended. Character and lawyer choices are locked.</p>}
    {([{ kind: 'character', title: 'Your character', entries: playerCharacters, selected: player.characterId },
      { kind: 'lawyer', title: 'Your lawyer', entries: lawyers, selected: player.lawyerId }] as const).map((group) =>
      <fieldset key={group.kind} disabled={busy || ended}><legend>{group.title}</legend><div className="art-catalog">
        {group.entries.map((entry) => <article key={entry.id} className="art-card">
          <AssetView id={`${group.kind}:${entry.assetId}`} type={group.kind} label={entry.description}
            paused={preferences.pauseAnimations || preferences.reducedMotion === 'on'} />
          <h3>{entry.name}</h3><p>{entry.description}</p><p className="art-personality">{entry.personality}</p>
          <button type="button" aria-pressed={group.selected === entry.id} onClick={() => onPick(group.kind, entry.id)}>
            {group.selected === entry.id ? 'Selected' : `Choose ${entry.name}`}
          </button>
        </article>)}
      </div></fieldset>)}
    <div className="art-personal-settings"><h3>Only on this browser</h3><p>Display settings never pause debate clocks or change another player's screen.</p>
      <label>Reduced motion<select value={preferences.reducedMotion} onChange={(event) => onDisplay({ ...preferences, reducedMotion: event.target.value as DisplayPreferences['reducedMotion'] })}>
        <option value="system">Follow OS</option><option value="on">On</option><option value="off">Off</option>
      </select></label>
      <label className="art-check"><input type="checkbox" checked={preferences.pauseAnimations} onChange={(event) => onDisplay({ ...preferences, pauseAnimations: event.target.checked })} />Pause artwork animations</label>
      <label>Text size<select value={preferences.textSize} onChange={(event) => onDisplay({ ...preferences, textSize: event.target.value === 'large' ? 'large' : 'standard' })}>
        <option value="standard">Standard</option><option value="large">Large</option>
      </select></label>
      <p role="status">{storageAvailable ? 'Display preferences are saved in this browser.' : 'Browser storage is unavailable. Display preferences still work in this tab.'}</p>
    </div>
  </section>
}
