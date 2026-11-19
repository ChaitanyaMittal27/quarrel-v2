import { useId, type ReactNode } from 'react'

export type SvgAssetProps = { className?: string; label?: string }

export function SvgFrame({ children, label, className, viewBox = '0 0 96 112', scenery = false }: SvgAssetProps & {
  children: ReactNode; viewBox?: string; scenery?: boolean
}) {
  const titleId = useId()
  return <svg className={className} viewBox={viewBox} preserveAspectRatio={scenery ? 'xMidYMid slice' : 'xMidYMid meet'}
    fill="none" shapeRendering="crispEdges" role={label ? 'img' : undefined}
    aria-hidden={label ? undefined : true} aria-labelledby={label ? titleId : undefined}>
    {label && <title id={titleId}>{label}</title>}{children}
  </svg>
}
