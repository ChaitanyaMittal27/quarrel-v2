import type { RoomSnapshot } from '@quarrel/shared/contract'

export function startDisabledReason(room: RoomSnapshot): string | null {
  if (room.you.slot !== 'A') return 'Only the host can start.'
  if (room.closed) return 'The room is closed.'
  if (room.setup.phase !== 'planning') return 'The room is not planning.'
  if (!room.plan) return 'The plan is still being prepared.'
  if (room.players.length !== 2 || room.players.some((player) => !player.connected || player.left)) return 'Both players must be connected.'
  return null
}

/** Anchor to the received Redis clock, then use monotonic elapsed time, including late joins. */
export function countdown(startsAt: string, serverNow: string, receivedAt: number, now: number): number {
  const remaining = remainingUntil(startsAt, serverNow, receivedAt, now)
  return Math.min(3, Math.max(0, Math.ceil(remaining / 1000)))
}

export function remainingUntil(deadline: string, serverNow: string, receivedAt: number, now: number): number {
  return Math.max(0, Date.parse(deadline) - Date.parse(serverNow) - Math.max(0, now - receivedAt))
}

export function clockRemaining(room: RoomSnapshot, slot: 'A' | 'B', receivedAt: number, now: number): number {
  const debate = room.debate
  if (!debate) return 0
  if (debate.activeSlot !== slot || !debate.deadline) return debate.clocks[slot]
  return Math.min(debate.clocks[slot], remainingUntil(debate.deadline, room.serverNow, receivedAt, now))
}

export function formatClock(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function sendDisabledReason(room: RoomSnapshot, text: string, receivedAt: number, now: number, kind: 'argument' | 'consult' = 'argument'): string | null {
  if (room.closed) return 'The room is closed.'
  if (room.setup.phase === 'ended') return 'Debate ended.'
  if (room.setup.phase !== 'debate' || !room.debate || !room.startsAt
    || remainingUntil(room.startsAt, room.serverNow, receivedAt, now) > 0) return 'The debate has not started.'
  if (room.debate.state !== 'composing') return 'A lawyer is at work. Both clocks are paused.'
  if (room.debate.activeSlot !== room.you.slot) return 'Wait for your turn.'
  if (clockRemaining(room, room.you.slot, receivedAt, now) <= 0) return 'Your clock has expired.'
  if (kind === 'argument' && room.debate.yourArgumentsThisSubtopic >= 12) return 'You reached 12 arguments. Your clock keeps running.'
  if (kind === 'consult' && room.debate.consultsLeft <= 0) return 'You have used both consultations for this subtopic.'
  if (!text.trim() || [...text].length > 600) return 'Write 1-600 characters.'
  return null
}

export type MessageAttempt = { roomId: string; ordinal: number; text: string; requestKey: string }
export function newPresentation(previous: RoomSnapshot | null, next: RoomSnapshot | null): 'A' | 'B' | null {
  if (!previous || !next || previous.roomId !== next.roomId) return null
  const last = next.messages.filter((message) => message.kind === 'argument').at(-1)
  return last && !previous.messages.some((message) => message.id === last.id) ? last.slot : null
}
export function messageAttempt(previous: MessageAttempt | null, roomId: string, ordinal: number, text: string,
  uuid: () => string = () => crypto.randomUUID()): MessageAttempt {
  return previous?.roomId === roomId && previous.ordinal === ordinal && previous.text === text
    ? previous : { roomId, ordinal, text, requestKey: uuid() }
}
