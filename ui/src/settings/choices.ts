import { SetChoicesRequest, type RoomSnapshot } from '@quarrel/shared/contract'
import { setChoices } from '../lib/api'

export type ChoiceKind = 'character' | 'lawyer'
export function saveChoice(roomId: string, kind: ChoiceKind, id: string) {
  const body = SetChoicesRequest.parse(kind === 'character' ? { characterId: id } : { lawyerId: id })
  return setChoices(roomId, body)
}

export function roomArenaPlayers(room: RoomSnapshot) {
  const seat = (slot: 'A' | 'B') => {
    const player = room.players.find((item) => item.slot === slot)
    return { name: player?.name ?? 'Waiting for player', characterId: player?.characterId, lawyerId: player?.lawyerId }
  }
  return { A: seat('A'), B: seat('B') }
}
