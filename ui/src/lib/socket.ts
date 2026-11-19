import { io, type Socket } from 'socket.io-client'
import { RoomSnapshotEvent, type RoomResponse, type RoomSnapshot, type ClientToServerEvents, type ServerToClientEvents } from '@quarrel/shared/contract'
import { ApiError, getSession, refreshAccess } from './api'

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'
export function acceptsSnapshot(current: RoomSnapshot | null, incoming: RoomSnapshot | null): boolean {
  return !current || !incoming || current.roomId !== incoming.roomId || incoming.version >= current.version
}

/** One connection per lobby. The HTTP helper owns refresh, including socket auth recovery. */
export function connectRoomSocket(options: {
  current: () => RoomSnapshot | null
  snapshot: (response: RoomResponse) => void
  status: (status: ConnectionStatus) => void
  error: (error: unknown) => void
}): () => void {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ autoConnect: false })
  let stopped = false
  let refreshed = false
  let sessionChecked = false
  let checkingSession = false
  async function recoverInactiveSocket(error?: Error) {
    if (stopped || !options.current() || checkingSession) return
    // One HTTP check/reconnect per rejection sequence prevents an auth-rejection loop.
    // A successful connection opens a new recovery sequence.
    if (sessionChecked) {
      options.status('disconnected')
      if (error) options.error(new Error(`Socket connection rejected: ${error.message}`))
      return
    }
    sessionChecked = true
    checkingSession = true
    const roomId = options.current()!.roomId
    options.status('reconnecting')
    try {
      const response = await getSession()
      if (stopped || options.current()?.roomId !== roomId) return
      if (acceptsSnapshot(options.current(), response.room)) options.snapshot(response)
      if (response.room) socket.connect()
      else socket.disconnect()
    } catch (failure) {
      if (!stopped && options.current()?.roomId === roomId) {
        options.status('disconnected')
        options.error(failure)
      }
    } finally { checkingSession = false }
  }
  socket.on('connect', () => { refreshed = false; sessionChecked = false; options.status('connected') })
  socket.on('disconnect', () => {
    if (socket.active) options.status('reconnecting')
    else void recoverInactiveSocket()
  })
  socket.io.on('reconnect_attempt', () => options.status('reconnecting'))
  socket.io.on('reconnect_failed', () => { void recoverInactiveSocket() })
  socket.on('room:snapshot', (value) => {
    const parsed = RoomSnapshotEvent.safeParse(value)
    if (!parsed.success) { options.error(parsed.error); return }
    if (!acceptsSnapshot(options.current(), parsed.data.room)) return
    options.snapshot(parsed.data)
    if (!parsed.data.room) socket.disconnect()
  })
  socket.on('connect_error', (error) => {
    if (error.message === 'SESSION_EXPIRED' && !refreshed) {
      refreshed = true
      options.status('reconnecting')
      void refreshAccess().then(() => { if (!stopped) socket.connect() }).catch((failure: unknown) => {
        if (stopped) return
        options.status('disconnected')
        options.error(failure)
        if (!(failure instanceof ApiError && ['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(failure.code))) {
          void recoverInactiveSocket()
        }
      })
    } else if (error.message === 'SESSION_EXPIRED' && refreshed) {
      options.status('disconnected')
      options.error(new ApiError('SESSION_EXPIRED', 'Your session expired after refresh.'))
    } else if (!socket.active) {
      void recoverInactiveSocket(error)
    } else {
      // Transport retries are expected while offline: the reconnect banner is enough.
      options.status('reconnecting')
    }
  })
  options.status('reconnecting')
  socket.connect()
  return () => {
    stopped = true
    socket.removeAllListeners()
    socket.io.removeAllListeners('reconnect_attempt')
    socket.io.removeAllListeners('reconnect_failed')
    socket.disconnect()
  }
}
