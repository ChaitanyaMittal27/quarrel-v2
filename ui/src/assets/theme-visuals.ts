import type { ThemeId } from '@quarrel/shared/config'

/** Theme-bound scenery/cast; player and lawyer choices deliberately live in global catalogs. */
export const themeVisuals: Readonly<Record<ThemeId, { background: string; bench: string; judge: string; jury: string }>> = {
  jungle: { background: 'background:jungle', bench: 'bench:jungle', judge: 'judge:lemur', jury: 'jury:jungle-jury' },
  superhero: { background: 'background:superhero', bench: 'bench:superhero', judge: 'judge:superhero-rook', jury: 'jury:superhero-jury' },
  detective: { background: 'background:detective', bench: 'bench:detective', judge: 'judge:detective-vale', jury: 'jury:detective-jury' },
  courtroom: { background: 'background:courtroom', bench: 'bench:courtroom', judge: 'judge:courtroom-rowan', jury: 'jury:courtroom-jury' },
}
