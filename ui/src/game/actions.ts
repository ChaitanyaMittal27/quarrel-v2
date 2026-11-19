import { CreateRoomRequest, JoinRoomRequest } from '@quarrel/shared/contract'
import { ApiError, createRoom, joinRoom } from '../lib/api'
import { humanError, parseForm } from './errors'

// The same schemas validate browser forms and the HTTP contract. No duplicate limits.
export function createGame(input: unknown) {
  const { name, topic, theme, durationSec } = parseForm(CreateRoomRequest, input)
  return createRoom(name, topic, theme, durationSec)
}
export function joinGame(input: unknown) {
  const data = parseForm(JoinRoomRequest, input)
  return joinRoom(data.name, data.code)
}

export function sessionEnded(failure: unknown): boolean {
  const code = failure instanceof ApiError ? failure.code : failure instanceof Error ? failure.message : ''
  return ['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(code)
}
export const gameError = humanError
export function homeNotice(previousRoom: boolean, nextRoom: boolean): string {
  return previousRoom && !nextRoom ? 'You have left the room, or it is no longer available.' : ''
}
export function connectionNotice(status: string): string {
  return status === 'reconnecting' ? 'Reconnecting\u2026' : ''
}
