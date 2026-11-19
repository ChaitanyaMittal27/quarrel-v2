import type { ComponentType } from 'react'
import type { ThemeId } from '@quarrel/shared/config'
import type { SvgAssetProps } from './primitives/SvgFrame'
import background0 from './backgrounds/jungle.tsx'
import background1 from './backgrounds/superhero.tsx'
import background2 from './backgrounds/detective.tsx'
import background3 from './backgrounds/courtroom.tsx'
import character0 from './characters/lion.tsx'
import character1 from './characters/zebra.tsx'
import character2 from './characters/superhero-scout.tsx'
import character3 from './characters/superhero-inventor.tsx'
import character4 from './characters/detective-reporter.tsx'
import character5 from './characters/detective-witness.tsx'
import character6 from './characters/courtroom-advocate-a.tsx'
import character7 from './characters/courtroom-advocate-b.tsx'
import lawyer0 from './lawyers/jungle-lawyer-a.tsx'
import lawyer1 from './lawyers/jungle-lawyer-b.tsx'
import lawyer2 from './lawyers/superhero-lawyer-a.tsx'
import lawyer3 from './lawyers/superhero-lawyer-b.tsx'
import lawyer4 from './lawyers/detective-lawyer-a.tsx'
import lawyer5 from './lawyers/detective-lawyer-b.tsx'
import lawyer6 from './lawyers/courtroom-lawyer-a.tsx'
import lawyer7 from './lawyers/courtroom-lawyer-b.tsx'
import judge0 from './judges/lemur.tsx'
import judge1 from './judges/superhero-rook.tsx'
import judge2 from './judges/detective-vale.tsx'
import judge3 from './judges/courtroom-rowan.tsx'
import bench0 from './benches/jungle.svg?url'
import bench1 from './benches/superhero.svg?url'
import bench2 from './benches/detective.svg?url'
import bench3 from './benches/courtroom.svg?url'
import jury0 from './juries/jungle.svg?url'
import jury1 from './juries/superhero.svg?url'
import jury2 from './juries/detective.svg?url'
import jury3 from './juries/courtroom.svg?url'

export const assetTypes = ['background', 'character', 'lawyer', 'judge', 'jury', 'bench'] as const
export type AssetType = typeof assetTypes[number]
export type ArtState = 'idle' | 'speaking'
export interface AssetEntry {
  id: string; type: AssetType; nativeThemes: readonly ThemeId[]; viewBox: string
  /** Normalized positions in the asset's viewBox, not CSS pixel offsets. */
  anchors: { ground: readonly [number, number]; nameplate: readonly [number, number] }
  supportedStates: readonly ArtState[]
  renderer: { kind: 'svg'; src: string } | { kind: 'component'; Component: ComponentType<SvgAssetProps> }
}

export const assetRegistry: readonly AssetEntry[] = [
  { id: 'background:jungle', type: 'background', nativeThemes: ['jungle'], viewBox: '0 0 960 440', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle'], renderer: { kind: 'component', Component: background0 } },
  { id: 'background:superhero', type: 'background', nativeThemes: ['superhero'], viewBox: '0 0 960 440', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle'], renderer: { kind: 'component', Component: background1 } },
  { id: 'background:detective', type: 'background', nativeThemes: ['detective'], viewBox: '0 0 960 440', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle'], renderer: { kind: 'component', Component: background2 } },
  { id: 'background:courtroom', type: 'background', nativeThemes: ['courtroom'], viewBox: '0 0 960 440', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle'], renderer: { kind: 'component', Component: background3 } },
  { id: 'character:lion', type: 'character', nativeThemes: ['jungle'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: character0 } },
  { id: 'character:zebra', type: 'character', nativeThemes: ['jungle'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: character1 } },
  { id: 'character:superhero-scout', type: 'character', nativeThemes: ['superhero'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: character2 } },
  { id: 'character:superhero-inventor', type: 'character', nativeThemes: ['superhero'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: character3 } },
  { id: 'character:detective-reporter', type: 'character', nativeThemes: ['detective'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: character4 } },
  { id: 'character:detective-witness', type: 'character', nativeThemes: ['detective'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: character5 } },
  { id: 'character:courtroom-advocate-a', type: 'character', nativeThemes: ['courtroom'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: character6 } },
  { id: 'character:courtroom-advocate-b', type: 'character', nativeThemes: ['courtroom'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: character7 } },
  { id: 'lawyer:jungle-lawyer-a', type: 'lawyer', nativeThemes: ['jungle'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: lawyer0 } },
  { id: 'lawyer:jungle-lawyer-b', type: 'lawyer', nativeThemes: ['jungle'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: lawyer1 } },
  { id: 'lawyer:superhero-lawyer-a', type: 'lawyer', nativeThemes: ['superhero'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: lawyer2 } },
  { id: 'lawyer:superhero-lawyer-b', type: 'lawyer', nativeThemes: ['superhero'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: lawyer3 } },
  { id: 'lawyer:detective-lawyer-a', type: 'lawyer', nativeThemes: ['detective'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: lawyer4 } },
  { id: 'lawyer:detective-lawyer-b', type: 'lawyer', nativeThemes: ['detective'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: lawyer5 } },
  { id: 'lawyer:courtroom-lawyer-a', type: 'lawyer', nativeThemes: ['courtroom'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: lawyer6 } },
  { id: 'lawyer:courtroom-lawyer-b', type: 'lawyer', nativeThemes: ['courtroom'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: lawyer7 } },
  { id: 'judge:lemur', type: 'judge', nativeThemes: ['jungle'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: judge0 } },
  { id: 'judge:superhero-rook', type: 'judge', nativeThemes: ['superhero'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: judge1 } },
  { id: 'judge:detective-vale', type: 'judge', nativeThemes: ['detective'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: judge2 } },
  { id: 'judge:courtroom-rowan', type: 'judge', nativeThemes: ['courtroom'], viewBox: '0 0 96 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle', 'speaking'], renderer: { kind: 'component', Component: judge3 } },
  { id: 'bench:jungle', type: 'bench', nativeThemes: ['jungle'], viewBox: '0 0 192 92', anchors: { ground: [0.5, 1], nameplate: [0.5, 0.5] }, supportedStates: ['idle'], renderer: { kind: 'svg', src: bench0 } },
  { id: 'bench:superhero', type: 'bench', nativeThemes: ['superhero'], viewBox: '0 0 192 92', anchors: { ground: [0.5, 1], nameplate: [0.5, 0.5] }, supportedStates: ['idle'], renderer: { kind: 'svg', src: bench1 } },
  { id: 'bench:detective', type: 'bench', nativeThemes: ['detective'], viewBox: '0 0 192 92', anchors: { ground: [0.5, 1], nameplate: [0.5, 0.5] }, supportedStates: ['idle'], renderer: { kind: 'svg', src: bench2 } },
  { id: 'bench:courtroom', type: 'bench', nativeThemes: ['courtroom'], viewBox: '0 0 192 92', anchors: { ground: [0.5, 1], nameplate: [0.5, 0.5] }, supportedStates: ['idle'], renderer: { kind: 'svg', src: bench3 } },
  { id: 'jury:jungle-jury', type: 'jury', nativeThemes: ['jungle'], viewBox: '0 0 192 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle'], renderer: { kind: 'svg', src: jury0 } },
  { id: 'jury:superhero-jury', type: 'jury', nativeThemes: ['superhero'], viewBox: '0 0 192 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle'], renderer: { kind: 'svg', src: jury1 } },
  { id: 'jury:detective-jury', type: 'jury', nativeThemes: ['detective'], viewBox: '0 0 192 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle'], renderer: { kind: 'svg', src: jury2 } },
  { id: 'jury:courtroom-jury', type: 'jury', nativeThemes: ['courtroom'], viewBox: '0 0 192 112', anchors: { ground: [0.5, 1], nameplate: [0.5, 1] }, supportedStates: ['idle'], renderer: { kind: 'svg', src: jury3 } }
]

const fallbacks: Record<AssetType, string> = {
  background: 'background:courtroom', bench: 'bench:courtroom', judge: 'judge:courtroom-rowan',
  jury: 'jury:courtroom-jury', character: 'character:courtroom-advocate-a', lawyer: 'lawyer:courtroom-lawyer-a',
}

export function resolveAsset(id: unknown, type: AssetType): { entry: AssetEntry; usedFallback: boolean } {
  if (!assetTypes.includes(type)) throw new TypeError('Invalid asset role')
  const requested = assetRegistry.find((asset) => asset.id === id && asset.type === type)
  return { entry: requested ?? assetRegistry.find((asset) => asset.id === fallbacks[type])!, usedFallback: !requested }
}

/** Validate the display boundary independently of React so it can be tested in Node. */
export function prepareAsset(id: unknown, type: AssetType, label: unknown, state: unknown = 'idle', paused: unknown = false) {
  if (typeof label !== 'string' || !label.trim()) throw new TypeError('Asset label is required')
  if (typeof paused !== 'boolean') throw new TypeError('Asset paused must be boolean')
  const resolved = resolveAsset(id, type)
  const motion: ArtState = resolved.entry.supportedStates.includes(state as ArtState) ? state as ArtState : 'idle'
  return { ...resolved, label: label.trim(), state: motion, paused }
}
