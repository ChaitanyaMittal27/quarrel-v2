import { AssetView } from './AssetView'
import type { ArtState } from '../../assets/registry'

export function PixelCharacter({ assetId, role, slot, name, label, state = 'idle', paused = false }: {
  assetId: string; role: 'character' | 'lawyer' | 'judge'; slot?: 'A' | 'B'
  name: string; label: string; state?: ArtState; paused?: boolean
}) {
  return <figure className="art-performer" data-role={role} data-slot={slot}>
    <AssetView id={assetId} type={role} label={label} state={state} paused={paused} />
    <figcaption className="art-nameplate"><strong>{name}</strong>
      <span>{role === 'character' ? `Player ${slot}` : role === 'lawyer' ? `Lawyer ${slot}` : 'Judge'}</span>
    </figcaption>
  </figure>
}
