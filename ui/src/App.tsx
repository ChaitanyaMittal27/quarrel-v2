import { useCallback, useEffect, useRef, useState } from 'react'
import type { HealthResponse, RoomResponse, RoomSnapshot } from '@quarrel/shared/contract'
import { ApiError, createRoom, getHealth, getSession, joinRoom, leaveRoom, setReady } from './lib/api'
import { acceptsSnapshot, connectRoomSocket, type ConnectionStatus } from './lib/socket'

function App() {
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const current = useRef<RoomSnapshot | null>(null)
  const [latest, setLatest] = useState<RoomResponse>({ room: null })
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected')
  const report = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && failure.code === 'UNAUTHENTICATED') {
      current.current = null
      setRoom(null)
      setLatest({ room: null })
    }
    setError(failure instanceof ApiError ? `${failure.code}: ${failure.message}`
      : failure instanceof Error ? failure.message : 'The request failed. Try again.')
  }, [])
  const apply = useCallback((response: RoomResponse) => {
    if (!acceptsSnapshot(current.current, response.room)) return
    current.current = response.room
    setLatest(response)
    setRoom(response.room)
  }, [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    void getSession().then((value) => { if (active) apply(value) }).catch((failure: unknown) => {
      if (active) report(failure)
    }).finally(() => { if (active) setLoading(false) })
    void getHealth(controller.signal).then((value) => { if (active) setHealth(value) })
    return () => { active = false; controller.abort() }
  }, [apply, report])

  const roomId = room?.roomId
  useEffect(() => {
    setCopied(false)
    if (!roomId) { setConnection('disconnected'); return }
    return connectRoomSocket({ current: () => current.current, snapshot: apply, status: setConnection, error: report })
  }, [roomId, apply, report])

  async function action(request: () => Promise<RoomResponse>) {
    setBusy(true)
    setError('')
    try { apply(await request()) } catch (failure) { report(failure) } finally { setBusy(false) }
  }

  const ownSeat = room?.players.find((player) => player.slot === room.you.slot)
  return <main>
    <header><p className="eyebrow">SLICE 1 TEST LOBBY</p><h1>Quarrel</h1><p>Two players. One room. Get ready for a debate.</p></header>
    {error && <div role="alert" className="error">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>Dismiss</button></div>}
    {loading ? <section aria-live="polite">Restoring your session...</section> : !room ? <section>
      <h2>Start a room</h2>
      <label>Your name<input autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex" /></label>
      <button disabled={busy} onClick={() => void action(() => createRoom(name))}>Create room</button>
      <div className="divider">or join a friend</div>
      <form onSubmit={(event) => { event.preventDefault(); void action(() => joinRoom(name, code)) }}>
        <label>Room code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="K7M2QX" autoCapitalize="characters" spellCheck={false} /></label>
        <button className="secondary" disabled={busy}>Join room</button>
      </form>
    </section> : <>
      <section>
        <div className="row"><h2>Your lobby</h2><span className="connection"><span className={`dot ${connection}`} />{connection}</span></div>
        <div className="room-code"><span>{room.code}</span><button className="secondary" onClick={() => {
          void navigator.clipboard.writeText(room.code).then(() => setCopied(true)).catch(report)
        }}>{copied ? 'Copied' : 'Copy code'}</button></div>
        <p className="muted">Share this code with the other player.</p>
        <div className="seats">{(['A', 'B'] as const).map((slot) => {
          const seat = room.players.find((player) => player.slot === slot)
          return <article className="seat" key={slot}><p className="eyebrow">PLAYER {slot}{room.you.slot === slot ? ' / YOU' : ''}</p>
            <h3>{seat?.name ?? 'Waiting for a player'}</h3>
            {seat ? <p>{seat.left ? 'Left the room' : seat.ready ? 'Ready' : 'Not ready'} / {seat.connected ? 'Connected' : 'Disconnected'}</p> : <p>Share the room code to invite someone.</p>}
          </article>
        })}</div>
        <p className={`ready-indicator ${room.bothReady ? 'yes' : ''}`} aria-live="polite">{room.bothReady ? 'Both ready!' : room.closed ? 'Room closed to new players' : 'Waiting for both players to be ready and connected'}</p>
        <div className="actions"><button disabled={busy} onClick={() => void action(() => setReady(room.roomId, !ownSeat?.ready))}>{ownSeat?.ready ? 'Not ready' : 'Ready'}</button>
          <button className="secondary" disabled={busy} onClick={() => void action(() => leaveRoom(room.roomId))}>Leave room</button></div>
        <p className="muted">Expires {new Date(room.expiresAt).toLocaleString()}</p>
      </section>
    </>}
    <details><summary>Debug / version {room?.version ?? 'none'}</summary><pre>{JSON.stringify(latest, null, 2)}</pre></details>
    <footer>API: {health ? `${health.ok ? 'ok' : 'degraded'} / Redis ${health.redis} / Supabase ${health.supabase}` : 'unreachable'}<br />Test UI / gameplay follows in later slices</footer>
  </main>
}

export default App
