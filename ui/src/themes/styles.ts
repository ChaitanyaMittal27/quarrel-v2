import type { CSSProperties } from 'react'
import type { ThemeConfig } from '@quarrel/shared/config'

/** Presentation tokens only; animation controls never enter clock/game state. */
export function themeStyles(theme: ThemeConfig): CSSProperties {
  const p = theme.palette
  return {
    '--art-canvas': p.canvas, '--art-paper': p.paper, '--art-panel': p.panel,
    '--art-ink': p.ink, '--art-muted': p.muted, '--art-line': p.border,
    '--art-accent': p.accent, '--art-accent-ink': p.accentInk, '--art-secondary': p.secondary,
    '--art-header': p.header, '--art-idle-duration': `${theme.animations.idle.durationMs}ms`,
    '--art-idle-distance': `${-theme.animations.idle.distancePx}px`,
    '--art-speaking-duration': `${theme.animations.speaking.durationMs}ms`,
  } as CSSProperties
}
