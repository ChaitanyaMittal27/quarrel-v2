import { useCallback, useEffect, useRef, useState } from 'react'
import type { HealthResponse, RoomResponse, RoomSnapshot, Theme, DurationSec } from '@quarrel/shared/contract'
import { themes, getTheme } from '@quarrel/shared/config'
import { ApiError, createRoom, getHealth, getSession, joinRoom, leaveRoom, setReady, setPosition, startDebate, submitMessage } from './lib/api'
import { countdown, startDisabledReason, clockRemaining, formatClock, sendDisabledReason, messageAttempt, type MessageAttempt } from './lib/debate'
import { acceptsSnapshot, connectRoomSocket, type ConnectionStatus } from './lib/socket'

function App() {
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const current = useRef<RoomSnapshot | null>(null)
  const [clock, setClock] = useState({ receivedAt: 0, now: 0 })
  const [latest, setLatest] = useState<RoomResponse>({ room: null })
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [theme, setTheme] = useState<Theme>('courtroom')
  const [topic, setTopic] = useState('')
  const [durationSec, setDurationSec] = useState<DurationSec>(240)
  const [positionDraft, setPositionDraft] = useState('')
  const [argument, setArgument] = useState('')
  const pending = useRef<MessageAttempt | null>(null)
  const [copied, setCopied] = useState(false)
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected')
  const report = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && failure.code === 'UNAUTHENTICATED') {
      current.current = null
      setRoom(null)
      setLatest({ room: null })
      setConnection('disconnected')
    }
    setError(failure instanceof ApiError ? `${failure.code}: ${failure.message}`
      : failure instanceof Error ? failure.message : 'The request failed. Try again.')
  }, [])
  const apply = useCallback((response: RoomResponse) => {
    if (!acceptsSnapshot(current.current, response.room)) return
    const previous = current.current
    const next = response.room
    if (previous?.roomId !== next?.roomId || previous?.setup.positions[previous.you.slot] !== next?.setup.positions[next.you.slot]) {
      setPositionDraft(next?.setup.positions[next.you.slot] ?? '')
    }
    if (previous?.roomId !== next?.roomId) { setCopied(false); setArgument(''); pending.current = null }
    if (!next) setConnection('disconnected')
    current.current = response.room
    const time = performance.now()
    setClock({ receivedAt: time, now: time })
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
  const startsAt = room?.startsAt
  const serverNow = room?.serverNow
  const running = room?.setup.phase === 'debate'
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      const now = performance.now()
      setClock((value) => ({ ...value, now }))
    }, 100)
    return () => clearInterval(timer)
  }, [running, startsAt, serverNow, clock.receivedAt])
  const savedPosition = room?.setup.positions[room.you.slot] ?? ''
  useEffect(() => {
    if (!roomId) return
    return connectRoomSocket({ current: () => current.current, snapshot: apply, status: setConnection, error: report })
  }, [roomId, apply, report])

  async function action(request: () => Promise<RoomResponse>) {
    setBusy(true)
    setError('')
    try { apply(await request()) } catch (failure) { report(failure) } finally { setBusy(false) }
  }

  const ownSeat = room?.players.find((player) => player.slot === room.you.slot)
  const startReason = room ? startDisabledReason(room) : null
  const seconds = room?.startsAt ? countdown(room.startsAt, room.serverNow, clock.receivedAt, clock.now) : 0
  const sendReason = room ? sendDisabledReason(room, argument, clock.receivedAt, clock.now) : null
  async function send() {
    if (!room?.debate) return
    const attempt = messageAttempt(pending.current, room.roomId, room.debate.ordinal, argument)
    pending.current = attempt
    setBusy(true); setError('')
    try {
      apply(await submitMessage(attempt.roomId, attempt.ordinal, attempt.text, attempt.requestKey))
      pending.current = null; setArgument('')
    } catch (failure) { report(failure) } finally { setBusy(false) }
  }
  return <main>
    <header><p className="eyebrow">SETUP TEST LOBBY</p><h1>Quarrel</h1><p>Two players. One room. Get ready for a debate.</p></header>
    {error && <div role="alert" className="error">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>Dismiss</button></div>}
    {loading ? <section aria-live="polite">Restoring your session...</section> : !room ? <section>
      <h2>Start a room</h2>
      <label>Your name<input autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex" /></label>
      <label>Theme<select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
        {themes.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
      </select></label>
      <label>Topic<textarea rows={3} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What would you like to debate?" /></label>
      <label>Duration<select value={durationSec} onChange={(event) => setDurationSec(Number(event.target.value) as DurationSec)}>
        {[120, 240, 360, 600].map((seconds) => <option key={seconds} value={seconds}>{seconds / 60} minutes per player</option>)}
      </select></label>
      <button disabled={busy} onClick={() => void action(() => createRoom(name, topic, theme, durationSec))}>Create room</button>
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
        <div className="setup"><p className="eyebrow">{getTheme(room.setup.theme).displayName} / {room.setup.durationSec / 60} minutes per player</p>
          <h3>{room.setup.topic}</h3><p className="muted">Setup is fixed for this room.</p></div>
        <div className="seats">{(['A', 'B'] as const).map((slot) => {
          const seat = room.players.find((player) => player.slot === slot)
          return <article className="seat" key={slot}><p className="eyebrow">PLAYER {slot}{room.you.slot === slot ? ' / YOU' : ''}</p>
            <h3>{seat?.name ?? 'Waiting for a player'}</h3>
            {seat ? <p>{seat.left ? 'Left the room' : seat.ready ? 'Ready' : 'Not ready'} / {seat.connected ? 'Connected' : 'Disconnected'}</p> : <p>Share the room code to invite someone.</p>}
          </article>
        })}</div>
        {room.setup.phase === 'waiting' ? <p role="status">Waiting for opponent</p> : <>
          <div className="positions"><h3>Your position</h3>
            {room.setup.phase === 'positions' ? <>
              <label className="sr-label">Your position<textarea rows={5} value={positionDraft} onChange={(event) => setPositionDraft(event.target.value)} /></label>
              <button disabled={busy} onClick={() => void action(() => setPosition(room.roomId, positionDraft))}>Save position</button>
              {positionDraft !== savedPosition && <p className="muted">Save your changes before becoming ready.</p>}
            </> : <p className="position-text">{savedPosition}</p>}
            <h3>Opponent's position</h3><p className="position-text">{room.setup.positions[room.you.slot === 'A' ? 'B' : 'A'] ?? 'No position yet'}</p>
          </div>
          {room.setup.phase === 'positions' && <button disabled={busy || (!ownSeat?.ready && (!savedPosition || positionDraft !== savedPosition))} onClick={() => void action(() => setReady(room.roomId, !ownSeat?.ready))}>{ownSeat?.ready ? 'Not ready' : 'Ready'}</button>}
          {room.plan && <div className="plan"><h3>Debate plan <small>({room.plan.source})</small></h3><p>{room.plan.text}</p>
            <ol>{room.plan.subtopics.map((item) => <li key={item.ordinal}><strong>{item.question}</strong><br />
              {item.secondsPerPlayer} seconds each / Player {item.openerSlot} opens</li>)}</ol></div>}
          {room.setup.phase === 'planning' && <>
            {!room.plan && <p role="status">Preparing the debate&hellip;</p>}
            {room.you.slot === 'A' ? <><button disabled={busy || startReason !== null} onClick={() => void action(() => startDebate(room.roomId))}>Start debate</button>
              {startReason && <p className="muted">{startReason}</p>}</> : room.plan && <p>Waiting for the host to start.</p>}
          </>}
          {room.setup.phase === 'debate' && <p className="ready-indicator yes" role="status">{seconds > 0 ? `Starting in ${seconds}` : 'Debate started'}</p>}
          {room.setup.phase === 'ended' && <p className="ready-indicator yes" role="status">Debate ended</p>}
          {room.debate && <div className="debate">
            <h3>Subtopic {room.debate.ordinal}</h3>
            <div className="seats">{(['A', 'B'] as const).map((slot) => <div className="seat" key={slot}>
              <strong>{slot}: {room.players.find((player) => player.slot === slot)?.name}</strong>
              <p className="chess-clock">{formatClock(clockRemaining(room, slot, clock.receivedAt, clock.now))}{room.debate?.activeSlot === slot ? ' / active' : ''}</p>
            </div>)}</div>
            <h3>Transcript</h3><ol className="transcript">{room.messages.map((message) => <li key={message.id}>
              <strong>{message.kind === 'announcement' ? 'Announcement' : `${message.slot}: ${room.players.find((player) => player.slot === message.slot)?.name}`}</strong>
              <p className="position-text">{message.text}</p>
            </li>)}</ol>
            {room.setup.phase === 'debate' && <form onSubmit={(event) => { event.preventDefault(); if (!busy && !sendReason) void send() }}>
              <label>Your argument<textarea rows={4} disabled={busy} value={argument} onChange={(event) => setArgument(event.target.value)} /></label>
              <p>{[...argument].length}/600 characters / {room.debate.yourArgumentsThisSubtopic}/12 arguments</p>
              <button disabled={busy || sendReason !== null}>Send</button>{sendReason && <p className="muted">{sendReason}</p>}
            </form>}
          </div>}
        </>}
        {room.closed && <p>Room closed to new players</p>}
        <p className="muted">{room.bothReady ? 'Both players ready and connected' : 'Both players are not yet ready and connected'}</p>
        <div className="actions"><button className="secondary" disabled={busy} onClick={() => void action(() => leaveRoom(room.roomId))}>Leave room</button></div>
        <p className="muted">Expires {new Date(room.expiresAt).toLocaleString()}</p>
      </section>
    </>}
    <details><summary>Debug / version {room?.version ?? 'none'}</summary><pre>{JSON.stringify(latest, null, 2)}</pre></details>
    <footer>API: {health ? `${health.ok ? 'ok' : 'degraded'} / Redis ${health.redis} / Supabase ${health.supabase}` : 'unreachable'}<br />Test UI / raw arguments and chess clocks</footer>
  </main>
}

export default App
