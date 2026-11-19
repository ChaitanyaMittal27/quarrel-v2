import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { playerCharacters, lawyers } from '@quarrel/shared/config'
import type { RoomSnapshot } from '@quarrel/shared/contract'
import { SettingsPanel } from '../src/settings/SettingsPanel'
import { defaultDisplayPreferences, displayPreferencesKey, loadDisplayPreferences, parseDisplayPreferences, saveDisplayPreferences } from '../src/settings/display-preferences'
import { saveChoice, roomArenaPlayers } from '../src/settings/choices'
import { RoomStage } from '../src/components/art/RoomStage'

const room: RoomSnapshot = {
  roomId: 'r_AAAAAAAAAAAAAAAAAAAAAA', code: 'ABC234', version: 1, createdAt: '2030-01-01T00:00:00Z',
  expiresAt: '2030-01-02T00:00:00Z', serverNow: '2030-01-01T00:00:01Z', closed: false, bothReady: false,
  setup: { phase: 'positions', theme: 'courtroom', topic: 'Topic', durationSec: 120, positions: { A: null, B: null } },
  plan: null, startsAt: null, debate: null, messages: [], you: { slot: 'A' },
  players: [
    { slot: 'A', name: 'Ann', characterId: 'jungle-zebra', lawyerId: 'detective-arden', ready: false, connected: true, left: false },
    { slot: 'B', name: 'Bo', characterId: 'superhero-inventor', lawyerId: 'courtroom-sage', ready: false, connected: true, left: false },
  ],
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Stage 5B settings', () => {
  it('rule 5B.5: pickers render every catalog preview, name and personality and disable only choices after ended', () => {
    const props = { player: room.players[0]!, ended: false, busy: false, preferences: { ...defaultDisplayPreferences }, storageAvailable: true, onPick: vi.fn(), onDisplay: vi.fn() }
    const html = renderToStaticMarkup(createElement(SettingsPanel, props))
    for (const [catalog, type] of [[playerCharacters, 'character'], [lawyers, 'lawyer']] as const) for (const entry of catalog) {
      expect(html).toContain(`data-asset-id="${type}:${entry.assetId}"`); expect(html).toContain(entry.name)
      expect(html).toContain(renderToStaticMarkup(createElement('span', null, entry.personality)).replace(/^<span>|<\/span>$/g, ''))
    }
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2)
    expect(html).toContain('Follow OS'); expect(html).toContain('Pause artwork animations'); expect(html).toContain('Text size')
    const ended = renderToStaticMarkup(createElement(SettingsPanel, { ...props, ended: true, storageAvailable: false }))
    expect(ended.match(/<fieldset disabled=""/g)).toHaveLength(2)
    expect(ended).toContain('still work in this tab'); expect(ended).not.toContain('Voice'); expect(ended).not.toContain('Speech source')
  })
  it('rule 5B.5: choosing posts only the own-seat field through the typed API and rejects an invalid catalog ID', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ room }), { status: 200 }))
    vi.stubGlobal('fetch', request)
    await saveChoice(room.roomId, 'character', 'jungle-lion')
    request.mockResolvedValueOnce(new Response(JSON.stringify({ room }), { status: 200 }))
    await saveChoice(room.roomId, 'lawyer', 'superhero-aster')
    expect(request.mock.calls.map(([url]) => url)).toEqual([`/api/rooms/${room.roomId}/choices`, `/api/rooms/${room.roomId}/choices`])
    expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toEqual({ characterId: 'jungle-lion' })
    expect(JSON.parse(String(request.mock.calls[1]![1]?.body))).toEqual({ lawyerId: 'superhero-aster' })
    expect(() => saveChoice(room.roomId, 'character', 'not-a-character')).toThrow()
  })
  it('rule 5B.6: the room arena uses both snapshots choices, including cross-theme cast and empty B fallback', () => {
    expect(roomArenaPlayers(room)).toEqual({ A: { name: 'Ann', characterId: 'jungle-zebra', lawyerId: 'detective-arden' }, B: { name: 'Bo', characterId: 'superhero-inventor', lawyerId: 'courtroom-sage' } })
    const html = renderToStaticMarkup(createElement(RoomStage, { room, receivedAt: 0, now: 0, preferences: { ...defaultDisplayPreferences, reducedMotion: 'off' } }))
    for (const id of ['character:zebra', 'lawyer:detective-lawyer-b', 'character:superhero-inventor', 'lawyer:courtroom-lawyer-b']) expect(html).toContain(`data-asset-id="${id}"`)
    expect(html).toContain('data-motion-preference="off"')
    expect(roomArenaPlayers({ ...room, players: room.players.slice(0, 1) }).B).toEqual({ name: 'Waiting for player', characterId: undefined, lawyerId: undefined })
    const active = { ...room, setup: { ...room.setup, phase: 'debate' as const }, debate: { ordinal: 1, activeSlot: 'A' as const, deadline: '2030-01-01T00:01:01Z', clocks: { A: 60000, B: 60000 }, yourArgumentsThisSubtopic: 0 } }
    const running = renderToStaticMarkup(createElement(RoomStage, { room: active, receivedAt: 0, now: 1000, preferences: { ...defaultDisplayPreferences, pauseAnimations: true } }))
    expect(running).toContain('0:59'); expect(running).toContain('data-paused="true"')
  })
  it('rule 5B.7: display preferences safely default for blocked storage, bad JSON and invalid values', () => {
    for (const raw of [null, '', '{', 'null', '[]', '3']) expect(parseDisplayPreferences(raw)).toEqual(defaultDisplayPreferences)
    expect(parseDisplayPreferences(JSON.stringify({ reducedMotion: 'invalid', pauseAnimations: 'yes', textSize: 'huge' }))).toEqual(defaultDisplayPreferences)
    for (const reducedMotion of ['on', 'off', 'system'] as const) {
      const prefs = { reducedMotion, pauseAnimations: true, textSize: 'large' as const }
      const storage = { getItem: vi.fn(() => JSON.stringify(prefs)), setItem: vi.fn() }
      expect(loadDisplayPreferences(() => storage)).toEqual({ preferences: prefs, storageAvailable: true })
      expect(saveDisplayPreferences(prefs, () => storage)).toBe(true)
      expect(storage.setItem).toHaveBeenCalledWith(displayPreferencesKey, JSON.stringify(prefs))
    }
    const blocked = () => { throw new Error('storage blocked') }
    expect(loadDisplayPreferences(blocked)).toEqual({ preferences: defaultDisplayPreferences, storageAvailable: false })
    expect(saveDisplayPreferences({ ...defaultDisplayPreferences }, blocked)).toBe(false)
    const quota = { getItem: () => null, setItem: () => { throw new Error('quota exceeded') } }
    expect(loadDisplayPreferences(() => quota).storageAvailable).toBe(true)
    expect(saveDisplayPreferences({ ...defaultDisplayPreferences }, () => quota)).toBe(false)
    vi.stubGlobal('window', { get localStorage() { throw new Error('denied') } })
    expect(loadDisplayPreferences().storageAvailable).toBe(false)
    expect(saveDisplayPreferences({ ...defaultDisplayPreferences })).toBe(false)
  })
})
