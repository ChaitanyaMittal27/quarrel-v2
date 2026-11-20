import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomResponse, ErrorCode, ArgumentText, SetPositionRequest, CreateRoomRequest, JoinRoomRequest, type RoomSnapshot } from '@quarrel/shared/contract'
import { HomeScreen, HomeForm, type HomeValues } from '../src/game/HomeScreen'
import { GameView, type GameViewProps } from '../src/game/GameView'
import { defaultDisplayPreferences } from '../src/settings/display-preferences'
import { RoomScreen, type RoomScreenProps } from '../src/game/RoomScreen'
import { connectionNotice, createGame, gameError, homeNotice, joinGame, sessionEnded } from '../src/game/actions'
import { ApiError } from '../src/lib/api'
import { clearField, errorMessages, feedbackFor, firstInvalidField, parseForm, focusInvalidField, type FocusRequest, type FieldName } from '../src/game/errors'
import { Consultations, PrivateNotes } from '../src/game/Consultations'
import { newPresentation } from '../src/lib/debate'
import { RoomStage } from '../src/components/art/RoomStage'

const fixture: RoomSnapshot = {
  roomId: 'r_AAAAAAAAAAAAAAAAAAAAAA', code: 'ABC234', version: 6,
  createdAt: '2030-01-01T00:00:00Z', expiresAt: '2030-01-02T00:00:00Z', serverNow: '2030-01-01T00:00:00Z',
  closed: false, bothReady: true, you: { slot: 'A' },
  players: [
    { slot: 'A', name: 'Ann', ready: true, connected: true, left: false, characterId: 'jungle-lion', lawyerId: 'courtroom-emery' },
    { slot: 'B', name: 'Bo', ready: true, connected: true, left: false, characterId: 'jungle-zebra', lawyerId: 'courtroom-sage' },
  ],
  setup: { phase: 'planning', theme: 'courtroom', topic: 'Should cities grow gardens?', durationSec: 120, positions: { A: 'Yes, gardens!', B: 'Keep the parks.' } },
  plan: { source: 'demo', text: 'A fair hearing', subtopics: [
    { ordinal: 1, question: 'Who benefits?', secondsPerPlayer: 60, openerSlot: 'A' },
    { ordinal: 2, question: 'Who pays?', secondsPerPlayer: 60, openerSlot: 'B' },
  ] }, startsAt: null, debate: null, messages: [], debateId: "d_AAAAAAAAAAAAAAAAAAAAAA", archivedAt: null, rematch: { A: false, B: false }, summaries: [], summary: null, jury: null, verdict: null,
}
function props(room = fixture): RoomScreenProps {
  return { room, busy: false, position: room.setup.positions.A ?? '', argument: 'My case', receivedAt: 100, now: 100,
    onPosition: vi.fn(), onArgument: vi.fn(), onSave: vi.fn(), onReady: vi.fn(), onStart: vi.fn(), onSend: vi.fn() }
}
type ControlProps = { children?: ReactNode; disabled?: boolean; onClick?: () => void;
  onSubmit?: (e: { preventDefault: () => void }) => void; onChange?: (e: { target: { value: string } }) => void }
function controls(node: ReactNode): ReactElement<ControlProps>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<ControlProps>(child) ? [child, ...controls(child.props.children)] : [])
}
function button(p: RoomScreenProps, label: string) {
  return controls(RoomScreen(p)).find((el) => el.type === 'button' && renderToStaticMarkup(el).includes(`>${label}</button>`))!
}
const html = (p: RoomScreenProps) => renderToStaticMarkup(createElement(RoomScreen, p))
const playing: RoomSnapshot = { ...fixture, setup: { ...fixture.setup, phase: 'debate' }, startsAt: '2030-01-01T00:00:03Z',
  debate: { ordinal: 1, activeSlot: 'A', clocks: { A: 60000, B: 60000 }, deadline: '2030-01-01T00:01:03Z', state: 'composing' as const, consultsLeft: 2, drafts: [], consultations: [], yourArgumentsThisSubtopic: 0 },
  messages: [{ id: 'm1', ordinal: 1, kind: 'argument', source: 'demo', slot: 'B', text: '<b>Keep parks</b>\nFor everyone.', at: fixture.serverNow }] }
afterEach(() => vi.unstubAllGlobals())

describe('Stage 6 private lawyer UI', () => {
  const draft = { id: 'w1', ordinal: 1, text: 'My private raw draft', at: fixture.serverNow, status: 'pending' as const }
  const busyRoom: RoomSnapshot = { ...playing, debate: { ...playing.debate!, state: 'lawyering', activeSlot: null, deadline: null, drafts: [draft] } }
  it('shows own preparation or opponent work, with paused clocks and no send action', () => {
    expect(html(props(busyRoom))).toContain('Your lawyer is preparing…')
    expect(html(props(busyRoom))).toContain('Both clocks are paused.')
    expect(button(props(busyRoom), 'Send').props.disabled).toBe(true)
    const peer = { ...busyRoom, debate: { ...busyRoom.debate!, drafts: [] } }
    expect(html(props(peer))).toContain('Their lawyer is at work')
    const scene = renderToStaticMarkup(createElement(RoomStage, { room: busyRoom, receivedAt: 0, now: 20000, preferences: defaultDisplayPreferences }))
    expect(scene.includes('Clocks paused')).toBe(true)
  })
  it('private consultation shows count/history, calls Ask and disables the third request with a reason', () => {
    const onAsk = vi.fn(), onQuestion = vi.fn()
    const room = { ...playing, debate: { ...playing.debate!, consultsLeft: 1, consultations: [{ id: 'c1', ordinal: 1, question: 'Private question', answer: 'Private advice', source: 'demo' as const, at: fixture.serverNow }] } }
    const p = { room, busy: false, question: 'Another question', receivedAt: 0, now: 3100, onAsk, onQuestion }
    const markup = renderToStaticMarkup(createElement(Consultations, p))
    for (const text of ['Only you can see', '1/2', 'Private question', 'Private advice']) expect(markup).toContain(text)
    const nodes = controls(Consultations(p))
    nodes.find((n) => n.type === 'textarea')!.props.onChange!({ target: { value: 'Edited question' } })
    expect(onQuestion).toHaveBeenCalledWith('Edited question')
    nodes.find((n) => n.type === 'form')!.props.onSubmit!({ preventDefault: vi.fn() }); expect(onAsk).toHaveBeenCalledOnce()
    const exhausted = renderToStaticMarkup(createElement(Consultations, { ...p, room: { ...room, debate: { ...room.debate!, consultsLeft: 0 } } }))
    expect(exhausted).toContain('used both consultations'); expect(exhausted).toContain('<button disabled=""')
  })
  it('keeps private drafts after ended and labels new presentations without inventing a speaker on restore', () => {
    const ended = { ...busyRoom, setup: { ...busyRoom.setup, phase: 'ended' as const }, debate: { ...busyRoom.debate!, state: 'ended' as const } }
    const notes = renderToStaticMarkup(createElement(PrivateNotes, { room: ended }))
    expect(notes).toContain('My private raw draft')
    const message = { id: 'm_new', ordinal: 1, kind: 'argument' as const, slot: 'A' as const, text: 'A public presentation', source: 'fallback' as const, at: fixture.serverNow }
    const next = { ...playing, messages: [...playing.messages, message] }
    expect(newPresentation(playing, next)).toBe('A'); expect(newPresentation(null, next)).toBeNull()
    expect(newPresentation(next, next)).toBeNull(); expect(newPresentation(next, null)).toBeNull()
    expect(html(props(next))).toContain('A public presentation'); expect(html(props(next))).toContain('Fallback')
    const scene = renderToStaticMarkup(createElement(RoomStage, { room: next, receivedAt: 0, now: 3100, preferences: defaultDisplayPreferences, speakingSlot: 'A' }))
    expect((scene.match(/data-state="speaking"/g) ?? []).length).toBe(1)
  })
  it('consult errors stay by the private field/button and clear on editing, without raw codes', () => {
    for (const code of ['LAWYER_BUSY', 'LIMIT_REACHED'] as const) {
      const feedback = feedbackFor(new ApiError(code, 'raw'), 'consult')
      const markup = renderToStaticMarkup(createElement(Consultations, { room: playing, busy: false, question: '', receivedAt: 0, now: 3100, onAsk: vi.fn(), onQuestion: vi.fn(), buttonErrors: feedback.buttons }))
      expect(markup).not.toContain(code); expect(feedback.banner).toBe('')
      expect(clearField(feedback, 'consultation').buttons.consult).toBeUndefined()
      if (code === 'LIMIT_REACHED') expect(markup).toContain('used both consultations')
    }
    let failure: unknown
    try { parseForm(ArgumentText, '', 'consultation') } catch (error) { failure = error }
    expect(feedbackFor(failure).fields.consultation).toMatch(/1-600/)
  })
})

describe('Stage 5C field and action feedback', () => {
  const values: HomeValues = { name: 'Ann', topic: 'Gardens?', code: 'ABC234', theme: 'courtroom', durationSec: 120 }
  const invalidInputs: [FieldName, string][] = [
    ['name', ''], ['name', 'a'.repeat(33)], ['name', 'Ann\n'],
    ['topic', ''], ['topic', 'x'.repeat(241)], ['topic', 'Bad\u0000topic'],
    ['code', ''], ['code', 'BAD!'], ['code', 'IOIOIO'],
    ['position', ''], ['position', 'x'.repeat(601)], ['position', 'Bad\u0000position'],
    ['argument', ''], ['argument', 'x'.repeat(601)], ['argument', 'Bad\u0000argument'],
  ]
  it.each(invalidInputs)('%s validates on submit and renders a red, described field for invalid input %j', (field, value) => {
    let failure: unknown
    try {
      if (field === 'name' || field === 'topic') parseForm(CreateRoomRequest, { ...values, [field]: value })
      if (field === 'code') parseForm(JoinRoomRequest, { ...values, code: value })
      if (field === 'position') parseForm(SetPositionRequest, { text: value }, 'position')
      if (field === 'argument') parseForm(ArgumentText, value, 'argument')
    } catch (error) { failure = error }
    const feedback = feedbackFor(failure)
    expect(feedback.fields[field]).toBeTruthy()
    expect(feedback.banner).toBe('')
    const markup = field === 'position' || field === 'argument'
      ? html({ ...props(field === 'position' ? { ...fixture, setup: { ...fixture.setup, phase: 'positions' } } : playing), now: 3100, fieldErrors: feedback.fields, [field]: value })
      : renderToStaticMarkup(createElement(HomeForm, { values: { ...values, [field]: value }, busy: false, fieldErrors: feedback.fields, onEdit: vi.fn(), onAction: vi.fn() }))
    expect(markup.includes('class="game-input-invalid"')).toBe(true)
    expect(markup.includes('aria-invalid="true"')).toBe(true)
    const description = /aria-invalid="true" aria-describedby="([^"]+)"/.exec(markup)![1]
    expect(markup.includes(`id="${description}"`)).toBe(true)
    expect(markup.includes(feedback.fields[field]!)).toBe(true)
  })
  it('focuses the first invalid field, repeats on resubmit, and clears only the edited error', () => {
    let failure: unknown
    try { createGame({ name: '', topic: '' }) } catch (error) { failure = error }
    const feedback = feedbackFor(failure)
    expect(firstInvalidField(feedback.fields)).toBe('name')
    const request: FocusRequest = { field: firstInvalidField(feedback.fields)!, attempt: 1 }
    const name = { focus: vi.fn() }, topic = { focus: vi.fn() }
    focusInvalidField(name, 'name', request); focusInvalidField(topic, 'topic', request)
    expect(name.focus).toHaveBeenCalledOnce(); expect(topic.focus).not.toHaveBeenCalled()
    focusInvalidField(name, 'name', { ...request, attempt: 2 }); expect(name.focus).toHaveBeenCalledTimes(2)
    const edited = clearField(feedback, 'name')
    expect(edited.fields.name).toBeUndefined(); expect(edited.fields.topic).toBeTruthy()
    expect(firstInvalidField(edited.fields)).toBe('topic')
  })
  it('Home edit handlers clear field feedback and empty forms remain submittable', () => {
    const clear = vi.fn(), edit = vi.fn(), action = vi.fn()
    const tree = HomeForm({ values, busy: false, onEdit: edit, onClearField: clear, onAction: action })
    const nodes = controls(tree)
    const input = nodes.find((n) => n.type === 'input')!
    input.props.onChange!({ target: { value: 'New name' } })
    expect(clear).toHaveBeenCalledWith('name'); expect(edit).toHaveBeenCalledWith('name', 'New name')
    const forms = nodes.filter((n) => n.type === 'form')
    forms[0]!.props.onSubmit!({ preventDefault: vi.fn() }); expect(action.mock.calls[0]![1]).toBe('create')
    forms[1]!.props.onSubmit!({ preventDefault: vi.fn() }); expect(action.mock.calls[1]![1]).toBe('join')
    const empty = renderToStaticMarkup(createElement(HomeForm, { values: { ...values, name: '', topic: '', code: '' }, busy: false, onEdit: edit, onAction: action }))
    expect(empty.includes('disabled')).toBe(false)
    expect(button({ ...props(playing), now: 3100, argument: '' }, 'Send').props.disabled).toBe(false)
  })
  it.each([
    ['ROOM_NOT_FOUND', 'join', 'code'], ['ROOM_FULL', 'join', 'code'], ['ROOM_EXPIRED', 'join', 'code'],
    ['INVALID_NAME', 'create', 'name'], ['INVALID_TOPIC', 'create', 'topic'],
    ['INVALID_POSITION', 'position', 'position'], ['POSITION_REQUIRED', 'ready', 'position'],
    ['INVALID_REQUEST', 'send', 'argument'], ['WRONG_PHASE', 'start', 'start'],
    ['PLAN_NOT_READY', 'start', 'start'], ['PLAYER_NOT_CONNECTED', 'start', 'start'], ['NOT_YOUR_TURN', 'send', 'send'],
  ] as const)('%s is shown by its %s control, not in the top banner', (code, action, target) => {
    const feedback = feedbackFor(new ApiError(code, 'raw server detail'), action)
    expect(feedback.banner).toBe('')
    expect({ ...feedback.fields, ...feedback.buttons }[target]).toBe(errorMessages[code])
    const markup = target === 'code' || target === 'name' || target === 'topic'
      ? renderToStaticMarkup(createElement(HomeForm, { values, busy: false, onEdit: vi.fn(), onAction: vi.fn(), fieldErrors: feedback.fields }))
      : html({ ...props(target === 'position' ? { ...fixture, setup: { ...fixture.setup, phase: 'positions' } } : target === 'start' ? fixture : playing), now: 3100, fieldErrors: feedback.fields, buttonErrors: feedback.buttons })
    expect(markup.includes(errorMessages[code])).toBe(true)
    expect(markup.includes(code)).toBe(false)
  })
  it('every contract code has a player message and unknown/raw failures never leak technical details', () => {
    expect(Object.keys(errorMessages).sort()).toEqual([...ErrorCode.options].sort())
    for (const code of ErrorCode.options) {
      const message = gameError(new ApiError(code, 'INTERNAL RAW DETAIL'))
      expect(message.length).toBeGreaterThan(10)
      for (const forbidden of ErrorCode.options) expect(message).not.toContain(forbidden)
    }
    expect(gameError(new Error('socket exception: INTERNAL'))).toBe('Something went wrong. Please try again.')
    expect(gameError(new ApiError('NEW_UNRECOGNIZED_CODE', 'raw detail'))).toBe('Something went wrong. Please try again.')
    expect(feedbackFor(new Error('offline'), 'send').banner).toBe('Something went wrong. Please try again.')
  })
})

describe('Stage 5C game screens', () => {
  it('the whole shell follows room/null/error state, with settings in every phase and no debug lobby', () => {
    const p: GameViewProps = { room: fixture, clock: { receivedAt: 0, now: 0 }, health: null, loading: false, busy: false,
      error: '', notice: '', positionDraft: '', argument: '', copied: false, connection: 'connected', settingsOpen: false,
      display: { preferences: { ...defaultDisplayPreferences, textSize: 'large', reducedMotion: 'on' }, storageAvailable: false },
      onSettings: vi.fn(), onDismiss: vi.fn(), onCopy: vi.fn(), onLeave: vi.fn(), onAction: vi.fn(), onDisplay: vi.fn(),
      onPick: vi.fn(), onPosition: vi.fn(), onArgument: vi.fn(), onSave: vi.fn(), onReady: vi.fn(), onStart: vi.fn(), onSend: vi.fn() }
    const render = (overrides: Partial<GameViewProps>) => renderToStaticMarkup(createElement(GameView, { ...p, ...overrides }))
    for (const phase of ['waiting', 'positions', 'planning', 'debate', 'ended'] as const) {
      const markup = render({ room: { ...fixture, setup: { ...fixture.setup, phase } } })
      expect(markup).toContain('>Settings</button>'); expect(markup).toContain('ABC234')
      expect(markup).toContain('data-text-size="large"'); expect(markup).toContain('data-motion-preference="on"')
      expect(markup).not.toContain('Debug')
    }
    const open = render({ settingsOpen: true, copied: true })
    expect(open.includes('room-settings')).toBe(true); expect(open.includes('Copied')).toBe(true); expect(open.includes('Your character')).toBe(true)
    expect(render({ loading: true })).toContain('Finding your seat')
    const gone = render({ room: null, notice: homeNotice(true, false) })
    expect(gone).toContain('Create room'); expect(gone).toContain('no longer available'); expect(gone).not.toContain('ABC234')
    const failure = new ApiError('SESSION_EXPIRED', 'expired')
    const expired = render({ room: sessionEnded(failure) ? null : fixture, error: gameError(failure) })
    expect(expired).toContain('Your session expired'); expect(expired).toContain('Join room'); expect(expired).not.toContain('>Settings</button>')
    const reconnecting = render({ connection: 'reconnecting', settingsOpen: true })
    expect(reconnecting.includes('Reconnecting\u2026')).toBe(true)
    expect(reconnecting.includes('ABC234')).toBe(true)
    expect(reconnecting.includes('game-reconnecting')).toBe(true)
    expect(reconnecting.includes('<fieldset disabled')).toBe(false)
    expect(render({ connection: 'connected' }).includes('game-reconnecting')).toBe(false)
    const debate = render({ room: playing, connection: 'reconnecting', argument: 'My case', clock: { receivedAt: 0, now: 10000 } })
    expect(debate.includes('<button>Send</button>')).toBe(true)
    expect(debate.includes('0:53')).toBe(true) // Last snapshot's active clock continues locally.
    const nodes = controls(GameView(p))
    nodes.find((n) => n.type === 'button' && renderToStaticMarkup(n).includes('>Settings</button>'))!.props.onClick!()
    expect(p.onSettings).toHaveBeenCalledOnce()
  })
  it('Home offers every theme, create fields and invitation form, with no temporary debug UI', () => {
    const markup = renderToStaticMarkup(createElement(HomeScreen, { busy: false, onAction: vi.fn() }))
    for (const text of ['Create room', 'Join room', 'Your name', 'The question', 'Room code', 'Courtroom', 'Jungle', 'Superhero', 'Detective', '#/gallery']) expect(markup).toContain(text)
    expect(markup).not.toMatch(/TEST LOBBY|Debug|raw snapshot/)
    const waiting = renderToStaticMarkup(createElement(HomeScreen, { busy: true, onAction: vi.fn() }))
    expect(waiting.match(/<button disabled=""/g)).toHaveLength(2)
  })
  it('validates create/join before HTTP and sends normalized inputs through the real API helper', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ room: fixture })))
    vi.stubGlobal('fetch', fetch)
    for (const input of [{ name: '', topic: 'Valid' }, { name: 'Ann', topic: '' }, { name: 'Ann', topic: 'x'.repeat(241) }, { name: 'Ann', topic: 'Hi', durationSec: 123 }]) {
      expect(() => createGame(input)).toThrow(ApiError)
    }
    expect(() => joinGame({ name: 'Ann', code: 'wrong!' })).toThrow(ApiError)
    expect(fetch).not.toHaveBeenCalled()
    expect(RoomResponse.parse(await createGame({ name: ' Ann ', topic: ' Gardens ' })).room?.roomId).toBe(fixture.roomId)
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ name: 'Ann', topic: 'Gardens', theme: 'courtroom', durationSec: 240 })
    await joinGame({ name: ' Bo ', code: ' abc234 ' })
    expect(fetch.mock.calls[1]![0]).toBe('/api/rooms/join')
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ name: 'Bo', code: 'ABC234' })
  })
  it.each(['ROOM_FULL', 'ROOM_EXPIRED', 'ROOM_NOT_FOUND', 'ROOM_CLOSED'])('explains %s from the server', async (code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, message: 'Server detail' } }), { status: 409 })))
    const error = await joinGame({ name: 'Ann', code: 'ABC234' }).catch((e: unknown) => e)
    expect(gameError(error)).not.toContain(code)
    expect(gameError(error)).not.toContain('Server detail')
  })
  it('waiting has no position/ready controls; positions exposes only your editable box and opponent status', () => {
    const waiting = html(props({ ...fixture, setup: { ...fixture.setup, phase: 'waiting' }, players: [fixture.players[0]!] }))
    expect(waiting).toContain('Waiting for opponent'); expect(waiting).not.toContain('<textarea')
    const p = props({ ...fixture, setup: { ...fixture.setup, phase: 'positions' } })
    const markup = html(p)
    expect(markup.match(/<textarea/g)).toHaveLength(1)
    expect(markup).toContain('Keep the parks.'); expect(markup).toContain('Ready · Connected')
    button(p, 'Not ready').props.onClick!(); expect(p.onReady).toHaveBeenCalledOnce()
    const edited = { ...p, position: 'A better case', room: { ...p.room, players: p.room.players.map((s) => ({ ...s, ready: false })) } }
    expect(button(edited, 'Ready').props.disabled).toBe(false)
    expect(button({ ...edited, position: ` ${p.position}\n` }, 'Ready').props.disabled).toBe(false)
    expect(button(edited, 'Save position').props.disabled).toBe(false)
    const nodes = controls(RoomScreen(edited))
    nodes.find((n) => n.type === 'textarea')!.props.onChange!({ target: { value: 'Edited again' } })
    expect(p.onPosition).toHaveBeenCalledWith('Edited again')
    nodes.find((n) => n.type === 'form')!.props.onSubmit!({ preventDefault: vi.fn() })
    expect(p.onSave).toHaveBeenCalledOnce()
    expect(button({ ...edited, position: '' }, 'Save position').props.disabled).toBe(false)
  })
  it('planning renders the live plan and openers; Start has actionable disabled reasons and is host-only', () => {
    const p = props()
    expect(html(p)).toContain('Ann opens'); expect(html(p)).toContain('Bo opens')
    expect(button(p, 'Start debate').props.disabled).toBe(false)
    button(p, 'Start debate').props.onClick!(); expect(p.onStart).toHaveBeenCalledOnce()
    const preparing = props({ ...fixture, plan: null })
    expect(html(preparing)).toContain('Preparing the debate…')
    expect(html(preparing)).toContain('The plan is still being prepared.')
    expect(button(preparing, 'Start debate').props.disabled).toBe(true)
    const absent = props({ ...fixture, players: fixture.players.map((s) => ({ ...s, connected: false })) })
    expect(button(absent, 'Start debate').props.disabled).toBe(true)
    const guest = html(props({ ...fixture, you: { slot: 'B' } }))
    expect(guest).toContain('Waiting for the host'); expect(guest).not.toContain('>Start debate</button>')
  })
  it('countdown follows startsAt; send is enabled only on your live turn and escapes the transcript', () => {
    const p = props(playing)
    for (const [elapsed, n] of [[0, 3], [1000, 2], [2000, 1]]) expect(html({ ...p, now: 100 + elapsed! })).toContain(`<strong>${n}</strong>`)
    expect(button(p, 'Send').props.disabled).toBe(true)
    const live = { ...p, now: 3100 }
    expect(html(live)).toContain('Who benefits?')
    expect(html(live)).toContain('&lt;b&gt;Keep parks&lt;/b&gt;')
    expect(html(live)).toContain('Your turn')
    expect(button(live, 'Send').props.disabled).toBe(false)
    controls(RoomScreen(live)).find((n) => n.type === 'form')!.props.onSubmit!({ preventDefault: vi.fn() })
    expect(p.onSend).toHaveBeenCalledOnce()
    const theirs = { ...live, room: { ...playing, you: { slot: 'B' as const } } }
    expect(button(theirs, 'Send').props.disabled).toBe(true)
    expect(controls(RoomScreen(theirs)).find((n) => n.type === 'textarea')!.props.disabled).toBe(true)
    controls(RoomScreen(theirs)).find((n) => n.type === 'form')!.props.onSubmit!({ preventDefault: vi.fn() })
    expect(p.onSend).toHaveBeenCalledOnce()
  })
  it('ended retains the transcript without Send; closed rooms explain how to start over', () => {
    const ended = html(props({ ...playing, setup: { ...playing.setup, phase: 'ended' } }))
    expect(ended).toContain('Debate ended'); expect(ended).toContain('Keep parks'); expect(ended).not.toContain('>Send</button>')
    expect(html(props({ ...fixture, closed: true }))).toContain('Room closed')
  })
  it('null snapshots and unrecoverable sessions return Home; connection notices never request a reload', () => {
    expect(homeNotice(true, false)).toMatch(/no longer available/)
    expect(homeNotice(false, false)).toBe(''); expect(homeNotice(true, true)).toBe('')
    for (const code of ['SESSION_EXPIRED', 'UNAUTHENTICATED']) {
      expect(sessionEnded(new ApiError(code, 'error'))).toBe(true)
      expect(gameError(new ApiError(code, 'error'))).not.toContain(code)
    }
    expect(sessionEnded(new Error('SESSION_EXPIRED'))).toBe(true)
    expect(gameError(new Error('SESSION_EXPIRED'))).toContain('Your session expired')
    expect(sessionEnded(new ApiError('ROOM_FULL', 'full'))).toBe(false)
    expect(sessionEnded(null)).toBe(false)
    for (const code of ['ROOM_EXPIRED', 'ROOM_NOT_FOUND', 'NOT_IN_ROOM']) expect(sessionEnded(new ApiError(code, 'error'))).toBe(false)
    expect(connectionNotice('reconnecting')).toBe('Reconnecting\u2026')
    expect(connectionNotice('disconnected')).toBe('')
    expect(connectionNotice('connected')).toBe('')
    expect(gameError(new Error('Network lost'))).toBe('Something went wrong. Please try again.')
    expect(gameError(null)).toBe('Something went wrong. Please try again.')
  })
})
