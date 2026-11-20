import { AudioPreferences } from '@quarrel/shared/contract'
export { AudioPreferences } from '@quarrel/shared/contract'
export const defaultAudioPreferences: AudioPreferences = {enabled:true,muted:false,autoplay:false,volume:.8,speed:1,browserFallback:true}
export const audioPreferencesKey = 'quarrel-audio-preferences-v2'
type StorageAccess = () => Pick<Storage,'getItem'|'setItem'>
export function loadAudioPreferences(storage: StorageAccess = () => window.localStorage) {
  try {
    const raw = storage().getItem(audioPreferencesKey), value = AudioPreferences.safeParse(raw ? JSON.parse(raw) : null)
    return {preferences:value.success ? value.data : {...defaultAudioPreferences},storageAvailable:true}
  } catch { return {preferences:{...defaultAudioPreferences},storageAvailable:false} }
}
export function saveAudioPreferences(preferences: AudioPreferences, storage: StorageAccess = () => window.localStorage): boolean {
  try { storage().setItem(audioPreferencesKey,JSON.stringify(AudioPreferences.parse(preferences))); return true }
  catch { return false }
}
