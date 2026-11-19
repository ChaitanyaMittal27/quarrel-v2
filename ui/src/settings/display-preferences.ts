export interface DisplayPreferences {
  reducedMotion: 'system' | 'on' | 'off'
  pauseAnimations: boolean
  textSize: 'standard' | 'large'
}
export const defaultDisplayPreferences: Readonly<DisplayPreferences> = { reducedMotion: 'system', pauseAnimations: false, textSize: 'standard' }
export const displayPreferencesKey = 'quarrel-display-preferences-v2'
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>

export function parseDisplayPreferences(raw: string | null): DisplayPreferences {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...defaultDisplayPreferences }
    const fields = value as Record<string, unknown>
    return { reducedMotion: fields.reducedMotion === 'on' || fields.reducedMotion === 'off' ? fields.reducedMotion : 'system',
      pauseAnimations: fields.pauseAnimations === true, textSize: fields.textSize === 'large' ? 'large' : 'standard' }
  } catch { return { ...defaultDisplayPreferences } }
}

export function loadDisplayPreferences(storage: StorageAccess = () => window.localStorage) {
  try { return { preferences: parseDisplayPreferences(storage().getItem(displayPreferencesKey)), storageAvailable: true } }
  catch { return { preferences: { ...defaultDisplayPreferences }, storageAvailable: false } }
}

export function saveDisplayPreferences(preferences: DisplayPreferences, storage: StorageAccess = () => window.localStorage): boolean {
  try { storage().setItem(displayPreferencesKey, JSON.stringify(preferences)); return true }
  catch { return false }
}
