import { prepareAsset, type ArtState, type AssetType } from '../../assets/registry'

export interface AssetViewProps {
  id: string; type: AssetType; label: string; state?: ArtState; paused?: boolean; className?: string
}

/** One display boundary for trusted bundled assets; replacements never change arena logic. */
export function AssetView({ id, type, label, state = 'idle', paused = false, className = '' }: AssetViewProps) {
  const asset = prepareAsset(id, type, label, state, paused)
  const { renderer } = asset.entry
  const [, , width, height] = asset.entry.viewBox.split(' ').map(Number)
  const decorative = type === 'background' || type === 'bench'
  return <span className={`art-asset ${className}`} data-asset-id={asset.entry.id} data-type={type}
    data-state={asset.state} data-paused={asset.paused} data-fallback={asset.usedFallback}
    style={{ aspectRatio: `${width} / ${height}` }} aria-hidden={decorative ? true : undefined}>
    {renderer.kind === 'svg' ? <img src={renderer.src} alt={decorative ? '' : asset.label} draggable={false}
      style={{ objectPosition: `${asset.entry.anchors.ground[0] * 100}% ${asset.entry.anchors.ground[1] * 100}%` }} />
      : <renderer.Component label={decorative ? undefined : asset.label} />}
  </span>
}
