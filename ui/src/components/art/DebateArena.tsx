import { resolveCharacter, resolveLawyer, type ThemeConfig } from '@quarrel/shared/config'
import { themeVisuals } from '../../assets/theme-visuals'
import type { ArtState } from '../../assets/registry'
import { themeStyles } from '../../themes/styles'
import { AssetView } from './AssetView'
import { PixelCharacter } from './PixelCharacter'

export interface ArenaSeat { name: string; characterId?: string | null; lawyerId?: string | null }
export interface ArenaClock { display: string; active: boolean; paused?: boolean }

/** Display only. Callers supply clock text/state; this stage owns no timers, room state or API. */
export function DebateArena({ theme, players, clocks, state = 'idle', paused = false, motionPreference = 'system', dialogue = 'Two perspectives. A fair hearing.', speakingSlot, judgeSpeaking }: {
  theme: ThemeConfig; players: Record<'A' | 'B', ArenaSeat>; clocks: Record<'A' | 'B', ArenaClock>
  state?: ArtState; paused?: boolean; motionPreference?: 'system' | 'on' | 'off'; dialogue?: string
  judgeSpeaking?: boolean
  speakingSlot?: 'A' | 'B' | null
}) {
  const visuals = themeVisuals[theme.id]
  return <div className="art-scope art-arena" data-theme={theme.id} data-motion-preference={motionPreference}
    data-reduced-motion={motionPreference === 'on'} style={themeStyles(theme)}>
    <div className="art-clockbar" aria-label="Debate clocks">{(['A', 'B'] as const).map((slot) =>
      <div className="art-clock" key={slot} data-active={clocks[slot].active}>
        <span>PLAYER {slot} / {players[slot].name}</span><strong>{clocks[slot].display}</strong>
        <small>{clocks[slot].paused ? 'Clocks paused' : clocks[slot].active ? 'Active clock' : 'Clock held'}</small>
      </div>)}</div>
    <div className="art-scene" role="group" aria-label={theme.environmentLabel}>
      <AssetView className="art-backdrop" id={visuals.background} type="background" label={theme.environmentLabel} />
      <div className="art-scene-caption"><span>{theme.displayName}</span><p>{dialogue}</p></div>
      <div className="art-cast">
        {(['A', 'B'] as const).map((slot) => {
          const character = resolveCharacter(players[slot].characterId, theme, slot)
          return <PixelCharacter key={slot} role="character" slot={slot} assetId={`character:${character.assetId}`}
            name={players[slot].name} label={`Player ${slot}: ${players[slot].name}`} state={state} paused={paused} />
        })}
        {(['A', 'B'] as const).map((slot) => {
          const lawyer = resolveLawyer(players[slot].lawyerId, theme, slot)
          return <PixelCharacter key={slot} role="lawyer" slot={slot} assetId={`lawyer:${lawyer.assetId}`}
            name="Counsel" label={`Player ${slot}'s lawyer`} state={speakingSlot === slot ? 'speaking' : state} paused={paused} />
        })}
        <div className="art-judge-stack">
          <PixelCharacter role="judge" assetId={visuals.judge} name={theme.judge.displayName}
            label={theme.judge.description} state={judgeSpeaking ? 'speaking' : state} paused={paused} />
          <AssetView className="art-bench" id={visuals.bench} type="bench" label={`${theme.displayName} bench`} />
        </div>
      </div>
    </div>
    <div className="art-jury"><AssetView id={visuals.jury} type="jury" label={theme.jury.description} />
      <div><strong>{theme.jury.displayName}</strong><p>Listening to both sides</p></div>
    </div>
  </div>
}
