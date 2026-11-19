import { describe, expect, it } from 'vitest'
import type { RoomSnapshot } from '@quarrel/shared/contract'
import { countdown, startDisabledReason, clockRemaining, formatClock, sendDisabledReason, messageAttempt } from '../src/lib/debate'

const room: RoomSnapshot = {
  roomId: 'r_AAAAAAAAAAAAAAAAAAAAAA', code: 'ABC234', version: 7,
  createdAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-02T00:00:00Z', serverNow: '2030-01-01T00:00:00Z',
  closed: false, bothReady: true, you: { slot: 'A' },
  players: [{ slot: 'A', name: 'Ann', ready: true, connected: true, characterId: "courtroom-advocate-a", lawyerId: "courtroom-emery", left: false }, { slot: 'B', name: 'Bo', ready: true, connected: true, characterId: "courtroom-advocate-a", lawyerId: "courtroom-emery", left: false }],
  setup: { phase: 'planning', theme: 'courtroom', topic: 'Topic', durationSec: 240, positions: { A: 'A view', B: 'B view' } },
  plan: { source: 'demo', text: 'Plan', subtopics: [
    { ordinal: 1, question: 'First?', secondsPerPlayer: 120, openerSlot: 'A' },
    { ordinal: 2, question: 'Second?', secondsPerPlayer: 120, openerSlot: 'B' },
  ] }, startsAt: null, debate: null, messages: [],
}
describe('Slice 3 UI', () => {
  const playing: RoomSnapshot = { ...room, setup: { ...room.setup, phase: 'debate' }, startsAt: room.serverNow,
    debate: { ordinal: 1, activeSlot: 'A', clocks: { A: 60000, B: 60000 }, deadline: '2030-01-01T00:01:00Z', yourArgumentsThisSubtopic: 0 } }
  it('rule 4.1: only the active clock ticks, clamps at zero and stays full during the countdown', () => {
    expect(clockRemaining(playing, 'A', 100, 1600)).toBe(58500)
    expect(clockRemaining(playing, 'B', 100, 1600)).toBe(60000)
    expect(clockRemaining(playing, 'A', 100, 999999)).toBe(0)
    expect(clockRemaining(room, 'A', 100, 100)).toBe(0)
    expect(clockRemaining({ ...playing, serverNow: '2029-12-31T23:59:57Z' }, 'A', 100, 100)).toBe(60000)
    expect(clockRemaining({ ...playing, debate: { ...playing.debate!, deadline: null } }, 'A', 0, 5000)).toBe(60000)
    expect([60000, 59500, 1, 0, -1, 120000].map(formatClock)).toEqual(['1:00', '1:00', '0:01', '0:00', '0:00', '2:00'])
  })
  it('rule 4.8-4.11: Send requires a live turn, started deadline, valid length and remaining quota', () => {
    expect(sendDisabledReason(playing, 'Hello', 0, 1)).toBeNull()
    expect(sendDisabledReason({ ...playing, closed: true }, 'Hello', 0, 1)).toMatch(/closed/)
    expect(sendDisabledReason({ ...playing, setup: { ...playing.setup, phase: 'ended' } }, 'Hello', 0, 1)).toMatch(/ended/)
    for (const notStarted of [room, { ...playing, debate: null }, { ...playing, startsAt: null }, { ...playing, startsAt: '2030-01-01T00:00:03Z' }]) {
      expect(sendDisabledReason(notStarted, 'Hello', 0, 0)).toMatch(/not started/)
    }
    expect(sendDisabledReason({ ...playing, you: { slot: 'B' } }, 'Hello', 0, 0)).toMatch(/turn/)
    expect(sendDisabledReason(playing, 'Hello', 0, 60000)).toMatch(/expired/)
    expect(sendDisabledReason({ ...playing, debate: { ...playing.debate!, yourArgumentsThisSubtopic: 12 } }, 'Hello', 0, 0)).toMatch(/12 arguments/)
    for (const text of ['', ' \n\t', 'x'.repeat(601)]) expect(sendDisabledReason(playing, text, 0, 0)).toMatch(/1-600/)
    expect(sendDisabledReason(playing, '😀'.repeat(600), 0, 0)).toBeNull()
  })
  it('rule 4.8: network retries reuse the UUID and raw content; changed room, ordinal or text gets a new key', () => {
    let counter = 0; const uuid = () => String(++counter)
    const first = messageAttempt(null, room.roomId, 1, ' text ', uuid)
    expect(first.text).toBe(' text ')
    expect(messageAttempt(first, room.roomId, 1, ' text ', uuid)).toBe(first)
    expect(counter).toBe(1)
    for (const [id, ordinal, text] of [['another', 1, ' text '], [room.roomId, 2, ' text '], [room.roomId, 1, 'text']] as const) {
      expect(messageAttempt(first, id, ordinal, text, uuid).requestKey).not.toBe(first.requestKey)
    }
    expect(messageAttempt(null, room.roomId, 1, 'Hello').requestKey).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('rule S3.7: countdown follows the server deadline through 3-2-1 and zero, independent of click time', () => {
    const startsAt = '2030-01-01T00:00:03Z'
    expect([0, 999, 1000, 2000, 2999, 3000, 9000].map((elapsed) => countdown(startsAt, room.serverNow, 500, 500 + elapsed)))
      .toEqual([3, 3, 2, 1, 1, 0, 0])
    expect(countdown(startsAt, '2030-01-01T00:00:02.100Z', 100, 100)).toBe(1)
    expect(countdown(startsAt, '2030-01-01T00:00:05Z', 100, 100)).toBe(0)
    expect(countdown(startsAt, room.serverNow, 100, 0)).toBe(3)
  })
  it('rule S3.7: Start is enabled only for a host with a plan and two live seats', () => {
    expect(startDisabledReason(room)).toBeNull()
    expect(startDisabledReason({ ...room, plan: null })).toBe('The plan is still being prepared.')
    expect(startDisabledReason({ ...room, you: { slot: 'B' } })).toBe('Only the host can start.')
    expect(startDisabledReason({ ...room, closed: true })).toBe('The room is closed.')
    expect(startDisabledReason({ ...room, setup: { ...room.setup, phase: 'debate' } })).toBe('The room is not planning.')
    expect(startDisabledReason({ ...room, players: room.players.slice(0, 1) })).toBe('Both players must be connected.')
    for (const change of [{ connected: false }, { left: true }]) {
      expect(startDisabledReason({ ...room, players: [room.players[0]!, { ...room.players[1]!, ...change }] })).toBe('Both players must be connected.')
    }
  })
});
