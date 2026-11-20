import { getTheme } from '@quarrel/shared/config'
import type { RoomSnapshot } from '@quarrel/shared/contract'
import { DebateArena } from './DebateArena'
import { roomArenaPlayers } from '../../settings/choices'
import { clockRemaining, formatClock } from '../../lib/debate'
import type { DisplayPreferences } from '../../settings/display-preferences'

export function RoomStage({ room, receivedAt, now, preferences, speakingSlot, judgeSpeaking }: { room: RoomSnapshot; receivedAt: number; now: number; preferences: DisplayPreferences; speakingSlot?: 'A' | 'B' | null; judgeSpeaking?: boolean }) {
  const clock = (slot: 'A' | 'B') => ({ display: room.debate ? formatClock(clockRemaining(room, slot, receivedAt, now)) : '—',
    active: room.debate?.activeSlot === slot && !room.closed,
    paused: !!room.debate && ['lawyering', 'consulting', 'summary', 'jury', 'complete'].includes(room.debate.state) })
  return <DebateArena theme={getTheme(room.setup.theme)} players={roomArenaPlayers(room)} clocks={{ A: clock('A'), B: clock('B') }}
    paused={preferences.pauseAnimations || preferences.reducedMotion === 'on'} motionPreference={preferences.reducedMotion} judgeSpeaking={judgeSpeaking} speakingSlot={speakingSlot} />
}
