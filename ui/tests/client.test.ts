import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomSnapshot } from '@quarrel/shared/contract'
import { createRoom, getSession, getHealth, joinRoom, leaveRoom, setReady, setPosition, startDebate, submitMessage, refreshAccess } from '../src/lib/api'
import { acceptsSnapshot, connectRoomSocket } from '../src/lib/socket'

const fake = vi.hoisted(() => ({ io: vi.fn() }))
vi.mock('socket.io-client', () => ({ io: fake.io }))
const request = vi.fn<typeof fetch>()
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const expired = () => json({ error: { code: 'SESSION_EXPIRED', message: 'Expired' } }, 401)
const room: RoomSnapshot = {
  roomId: 'r_AAAAAAAAAAAAAAAAAAAAAA', code: 'ABC234', version: 2,
  createdAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-01-02T00:00:00.000Z', serverNow: '2030-01-01T00:00:01.000Z',
  closed: false, bothReady: false, plan: null, startsAt: null, debate: null, messages: [], you: { slot: 'A' },
  setup: { phase: 'waiting', theme: 'courtroom', topic: 'Test', durationSec: 240, positions: { A: null, B: null } },
  players: [{ slot: 'A', name: 'Ann', ready: false, connected: true, left: false }],
}
beforeEach(() => { vi.stubGlobal('fetch', request); request.mockReset(); request.mockImplementation(async () => json({ room: null })) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('UI HTTP contract and refresh', () => {
  it('rule 4.8: message HTTP retries after refresh keep ordinal, exact text and UUID unchanged', async () => {
    request.mockResolvedValueOnce(expired()).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json({ room }))
    const key = '00000000-0000-4000-8000-000000000000'
    await submitMessage(room.roomId, 1, ' raw\ntext ', key)
    expect(request.mock.calls[0]![0]).toBe(`/api/rooms/${room.roomId}/messages`)
    expect(request.mock.calls[2]![1]).toEqual(request.mock.calls[0]![1])
    expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toEqual({ ordinal: 1, text: ' raw\ntext ', requestKey: key })
  })
  it('uses typed room routes and sends no JSON Content-Type on a bodiless leave', async () => {
    await getSession(); await createRoom('Ann', 'Test topic'); await joinRoom('Bo', 'ABC234'); await setReady(room.roomId, true); await setPosition(room.roomId, 'My view'); await startDebate(room.roomId); await leaveRoom(room.roomId)
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/api/session', '/api/rooms', '/api/rooms/join', `/api/rooms/${room.roomId}/ready`, `/api/rooms/${room.roomId}/position`, `/api/rooms/${room.roomId}/start`, `/api/rooms/${room.roomId}/leave`])
    expect(request.mock.calls[5]![1]).not.toHaveProperty('headers')
    expect(request.mock.calls[6]![1]).not.toHaveProperty('headers')
    expect(JSON.parse(String(request.mock.calls[3]![1]?.body))).toEqual({ ready: true })
    expect(JSON.parse(String(request.mock.calls[1]![1]?.body))).toEqual({ name: 'Ann', topic: 'Test topic', theme: 'courtroom', durationSec: 240 })
    expect(JSON.parse(String(request.mock.calls[4]![1]?.body))).toEqual({ text: 'My view' })
  })
  it('shares one refresh across concurrent HTTP callers, then retries each once', async () => {
    request.mockReset()
    request.mockResolvedValueOnce(expired()).mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockImplementation(async () => json({ room: null }))
    expect(await Promise.all([getSession(), getSession()])).toEqual([{ room: null }, { room: null }])
    expect(request.mock.calls.filter(([path]) => path === '/api/session/refresh')).toHaveLength(1)
    expect(request).toHaveBeenCalledTimes(5)
  })
  it('shows API code/message when refresh fails and never loops', async () => {
    request.mockResolvedValueOnce(expired()).mockResolvedValueOnce(json({ error: { code: 'UNAUTHENTICATED', message: 'Start again' } }, 401))
    await expect(getSession()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', message: 'Start again' })
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('rejects invalid response shapes and safely handles non-JSON failures', async () => {
    request.mockResolvedValueOnce(json({ room: null, secret: 'hidden' }))
    await expect(getSession()).rejects.toBeInstanceOf(Error)
    request.mockResolvedValueOnce(new Response('unavailable', { status: 502 }))
    await expect(createRoom('Ann', 'Test topic')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('health accepts degraded reports and handles unreachable or invalid responses', async () => {
    request.mockResolvedValueOnce(json({ ok: false, redis: 'up', supabase: 'down' }, 503))
    expect(await getHealth()).toMatchObject({ ok: false })
    request.mockRejectedValueOnce(new Error('offline'))
    expect(await getHealth()).toBeNull()
    request.mockResolvedValueOnce(json({}, 502))
    expect(await getHealth()).toBeNull()
    request.mockResolvedValueOnce(json({ nonsense: true }))
    expect(await getHealth()).toBeNull()
  })
  it('exports the same refresh path for socket auth recovery', async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await refreshAccess()
    expect(request).toHaveBeenCalledWith('/api/session/refresh', { method: 'POST' })
  })
})

class TestSocket extends EventEmitter {
  active = false
  io = new EventEmitter()
  connect = vi.fn(() => this)
  disconnect = vi.fn(() => this)
}
function wiring() {
  const socket = new TestSocket()
  fake.io.mockReturnValue(socket)
  const options = { current: () => room, snapshot: vi.fn(), status: vi.fn(), error: vi.fn() }
  const stop = connectRoomSocket(options)
  return { socket, options, stop }
}
describe('UI socket state', () => {
  it('ignores only lower versions in the same room; accepts equal, new room and null', () => {
    expect(acceptsSnapshot(room, { ...room, version: 1 })).toBe(false)
    expect(acceptsSnapshot(room, { ...room })).toBe(true)
    expect(acceptsSnapshot(room, { ...room, roomId: 'r_BBBBBBBBBBBBBBBBBBBBBB', version: 1 })).toBe(true)
    expect(acceptsSnapshot(room, null)).toBe(true)
    expect(acceptsSnapshot(null, room)).toBe(true)
  })
  it('parses snapshots, updates connection state and disconnects when the room clears', () => {
    const { socket, options, stop } = wiring()
    socket.emit('connect'); expect(options.status).toHaveBeenLastCalledWith('connected')
    socket.emit('room:snapshot', { room: { ...room, version: 1 } }); expect(options.snapshot).not.toHaveBeenCalled()
    socket.emit('room:snapshot', { room }); expect(options.snapshot).toHaveBeenCalledWith({ room })
    socket.emit('room:snapshot', { room: null }); expect(socket.disconnect).toHaveBeenCalled()
    socket.emit('room:snapshot', { secret: 1 }); expect(options.error).toHaveBeenCalled()
    socket.active = true; socket.emit('disconnect'); expect(options.status).toHaveBeenLastCalledWith('reconnecting')
    socket.io.emit('reconnect_attempt'); expect(options.status).toHaveBeenLastCalledWith('reconnecting')
    stop(); expect(socket.listenerCount('room:snapshot')).toBe(0)
  })
  it('refreshes and reconnects once on SESSION_EXPIRED, then surfaces a repeated rejection', async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { socket, options, stop } = wiring()
    const refreshed = new Promise<void>((resolve) => socket.connect.mockImplementation(() => { resolve(); return socket }))
    socket.emit('connect_error', new Error('SESSION_EXPIRED'))
    await refreshed
    socket.emit('connect_error', new Error('SESSION_EXPIRED'))
    expect(request).toHaveBeenCalledTimes(1)
    expect(options.error).toHaveBeenCalled()
    stop()
  })
  it('does not reconnect after disposal while refresh is in flight', async () => {
    let complete!: (response: Response) => void
    request.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    const { socket, stop } = wiring()
    socket.emit('connect_error', new Error('SESSION_EXPIRED'))
    stop()
    complete(new Response(null, { status: 204 }))
    await refreshAccess()
    expect(socket.connect).toHaveBeenCalledTimes(1)
  })
})
