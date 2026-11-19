import { useState } from 'react'
import { getTheme, themes, playerCharacters, lawyers, type ThemeId } from '@quarrel/shared/config'
import { DebateArena } from '../components/art/DebateArena'
import { AssetView } from '../components/art/AssetView'
import { themeStyles } from '../themes/styles'
import type { ArtState } from '../assets/registry'

/** Isolated display fixture, never reads a session or calls an API. */
export function Gallery() {
  const [themeId, setThemeId] = useState<ThemeId>('courtroom')
  const [state, setState] = useState<ArtState>('idle')
  const [reduced, setReduced] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [characterId, setCharacterId] = useState('jungle-lion')
  const [lawyerId, setLawyerId] = useState('superhero-aster')
  const theme = getTheme(themeId)
  return <div className="art-scope art-gallery" data-reduced-motion={reduced} style={themeStyles(theme)}>
    <header className="art-gallery-header"><a href="#/">Back to test lobby</a><p className="art-eyebrow">QUARREL / ART GALLERY</p>
      <h1>Four worlds.<br />A cast of your own.</h1><p>Bundled original pixel art. Preview any character and lawyer in every setting.</p></header>
    <div className="art-toolbar">
      <label>Setting<select value={themeId} onChange={(event) => setThemeId(event.target.value as ThemeId)}>
        {themes.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
      </select></label>
      <label>Motion<select value={state} onChange={(event) => setState(event.target.value as ArtState)}>
        <option value="idle">Idle</option><option value="speaking">Speaking</option>
      </select></label>
      <label className="art-check"><input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} />Reduce motion</label>
      <label className="art-check"><input type="checkbox" checked={narrow} onChange={(event) => setNarrow(event.target.checked)} />320px stage preview</label>
    </div>
    <div className="art-gallery-stage" data-narrow={narrow}>
      <DebateArena theme={theme} state={state} paused={reduced}
        players={{ A: { name: 'Alex', characterId, lawyerId }, B: { name: 'Sam', characterId, lawyerId } }}
        clocks={{ A: { display: '01:00', active: true }, B: { display: '00:45', active: false } }} />
    </div>
    <p className="art-note">Preview clocks are static. Both seats share the selected cast to show that duplicates are allowed. These choices are local gallery fixtures, not saved settings.</p>
    {([{ title: 'Player characters', type: 'character', entries: playerCharacters }, { title: 'Lawyers', type: 'lawyer', entries: lawyers }] as const).map((group) =>
      <section className="art-catalog-section" key={group.type}><h2>{group.title}</h2><div className="art-catalog">
        {group.entries.map((entry) => <article className="art-card" key={entry.id}>
          <AssetView id={`${group.type}:${entry.assetId}`} type={group.type} label={entry.description} state={state} paused={reduced} />
          <h3>{entry.name}</h3><p>{entry.description}</p><p className="art-personality">{entry.personality}</p>
          <button type="button" aria-pressed={(group.type === 'character' ? characterId : lawyerId) === entry.id}
            onClick={() => group.type === 'character' ? setCharacterId(entry.id) : setLawyerId(entry.id)}>Preview in scene</button>
        </article>)}
      </div></section>)}
  </div>
}
