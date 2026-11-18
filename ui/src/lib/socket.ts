import { io, type Socket } from 'socket.io-client'
import { RoomSnapshotEvent, type RoomResponse, type RoomSnapshot, type ClientToServerEvents, type ServerToClientEvents } from '@quarrel/shared/contract'
import { refreshAccess } from './api'

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
  socket.on('connect', () => { refreshed = false; options.status('connected') })
  socket.on('disconnect', () => options.status(socket.active ? 'reconnecting' : 'disconnected'))
  socket.io.on('reconnect_attempt', () => options.status('reconnecting'))
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
        if (!stopped) { options.status('disconnected'); options.error(failure) }
      })
    } else {
      options.status(socket.active ? 'reconnecting' : 'disconnected')
      options.error(error)
    }
  })
  options.status('reconnecting')
  socket.connect()
  return () => {
    stopped = true
    socket.removeAllListeners()
    socket.io.removeAllListeners('reconnect_attempt')
    socket.disconnect()
  }
}
