import { ArgumentText, SetPositionRequest } from '@quarrel/shared/contract'
import { emptyFeedback, feedbackFor, firstInvalidField, clearField, parseForm, FormError, type ActionName, type FieldName, type FocusRequest } from './errors'
import { GameView } from './GameView'
import { homeNotice, sessionEnded } from './actions'
import './game.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HealthResponse, RoomResponse, RoomSnapshot } from '@quarrel/shared/contract'
import { getHealth, getSession, leaveRoom, setReady, setPosition, startDebate, retryJury, requestRematch, submitMessage } from '../lib/api'
import { messageAttempt, newPresentation, type MessageAttempt } from '../lib/debate'
import { acceptsSnapshot, connectRoomSocket, type ConnectionStatus } from '../lib/socket'
import { loadDisplayPreferences, saveDisplayPreferences, type DisplayPreferences } from '../settings/display-preferences'
import { saveChoice } from '../settings/choices'

export function GameApp() {
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const current = useRef<RoomSnapshot | null>(null)
  const [clock, setClock] = useState({ receivedAt: 0, now: 0 })
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(emptyFeedback)
  const [focus, setFocus] = useState<FocusRequest>()
  const focusAttempt = useRef(0)
  const [notice, setNotice] = useState('')
  const [positionDraft, setPositionDraft] = useState('')
  const [argument, setArgument] = useState('')
  const [question, setQuestion] = useState('')
  const [speaking, setSpeaking] = useState<{ slot: 'A' | 'B' } | null>(null)
  const pending = useRef<MessageAttempt | null>(null)
  const pendingConsult = useRef<MessageAttempt | null>(null)
  const [copied, setCopied] = useState(false)
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [display, setDisplay] = useState(() => loadDisplayPreferences())
  function updateDisplay(preferences: DisplayPreferences) {
    setDisplay({ preferences, storageAvailable: saveDisplayPreferences(preferences) })
  }
  const report = useCallback((failure: unknown, context?: ActionName) => {
    if (sessionEnded(failure)) {
      current.current = null
      setRoom(null)
      setConnection('disconnected')
      setSettingsOpen(false)
    }
    const next = feedbackFor(failure, context)
    setFeedback(next)
    const field = firstInvalidField(next.fields)
    setFocus(field ? { field, attempt: ++focusAttempt.current } : undefined)
  }, [])
  const apply = useCallback((response: RoomResponse) => {
    if (!acceptsSnapshot(current.current, response.room)) return
    const previous = current.current
    const next = response.room
    if (previous?.roomId !== next?.roomId || previous?.setup.positions[previous.you.slot] !== next?.setup.positions[next.you.slot]) {
      setPositionDraft(next?.setup.positions[next.you.slot] ?? '')
    }
    if (previous?.roomId !== next?.roomId || previous?.debateId !== next?.debateId) { setCopied(false); setArgument(''); setQuestion(''); pending.current = null; pendingConsult.current = null; setSpeaking(null) }
    const speaker = newPresentation(previous, next)
    if (speaker) setSpeaking({ slot: speaker })
    if (!next) setConnection('disconnected')
    current.current = response.room
    const time = performance.now()
    setClock({ receivedAt: time, now: time })
    const message = homeNotice(!!previous, !!next)
    if (message) setNotice(message)
    if (!next) setSettingsOpen(false)
    setRoom(response.room)
    setFeedback((value) => ({ ...value, buttons: {} }))
  }, [])

  useEffect(() => {
    if (!speaking) return
    const timer = setTimeout(() => setSpeaking(null), 1800)
    return () => clearTimeout(timer)
  }, [speaking])

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
  const running = !!room && ['debate', 'summary', 'jury'].includes(room.setup.phase)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      const now = performance.now()
      setClock((value) => ({ ...value, now }))
    }, 100)
    return () => clearInterval(timer)
  }, [running, startsAt, serverNow, clock.receivedAt])
  useEffect(() => {
    if (!roomId) return
    return connectRoomSocket({ current: () => current.current, snapshot: apply, status: setConnection, error: report })
  }, [roomId, apply, report])

  async function action(request: () => Promise<RoomResponse>, context?: ActionName) {
    const sourceRoom = current.current?.roomId
    setBusy(true)
    setFeedback(emptyFeedback()); setNotice('')
    try {
      const response = await request()
      // An HTTP reply must not restore a room after a null push or terminal session failure.
      if (!sourceRoom || current.current?.roomId === sourceRoom) apply(response)
    } catch (failure) { report(failure, context) } finally { setBusy(false) }
  }

  const ownSeat = room?.players.find((player) => player.slot === room.you.slot)
  async function send(kind: 'argument' | 'consult' = 'argument') {
    if (!room?.debate) return
    setBusy(true); setFeedback(emptyFeedback())
    try {
      const text = parseForm(ArgumentText, kind === 'argument' ? argument : question, kind === 'argument' ? 'argument' : 'consultation')
      const retry = kind === 'argument' ? pending : pendingConsult
      const attempt = messageAttempt(retry.current, room.roomId, room.debate.ordinal, text)
      retry.current = attempt
      const response = await submitMessage(attempt.roomId, attempt.ordinal, attempt.text, attempt.requestKey, kind)
      if (current.current?.roomId === attempt.roomId) apply(response)
      retry.current = null
      if (kind === 'argument') setArgument(''); else setQuestion('')
    } catch (failure) { report(failure, kind === 'argument' ? 'send' : 'consult') } finally { setBusy(false) }
  }
  function editField(field: FieldName) { setFeedback((value) => clearField(value, field)) }

  return <GameView room={room} clock={clock} health={health} loading={loading} busy={busy} error={feedback.banner} fieldErrors={feedback.fields} buttonErrors={feedback.buttons} focus={focus} onClearField={editField} notice={notice}
    question={question} onQuestion={(text) => { setQuestion(text); editField('consultation') }} onAsk={() => void send('consult')} speakingSlot={speaking?.slot}
    positionDraft={positionDraft} argument={argument} copied={copied} connection={connection} settingsOpen={settingsOpen} display={display}
    onSettings={() => setSettingsOpen(!settingsOpen)} onDismiss={() => setFeedback((value) => ({ ...value, banner: '' }))} onCopy={() => {
      if (room) void navigator.clipboard.writeText(room.code).then(() => setCopied(true)).catch(() => setFeedback({ ...emptyFeedback(), banner: `Copy unavailable. Share this code: ${room.code}` }))
    }} onLeave={() => { if (room) void action(() => leaveRoom(room.roomId), 'leave') }} onAction={(request, context) => void action(request, context)} onDisplay={updateDisplay}
    onPick={(kind, id) => { if (room) void action(() => saveChoice(room.roomId, kind, id), 'settings') }}
    onPosition={(text) => { setPositionDraft(text); editField('position') }} onArgument={(text) => { setArgument(text); editField('argument') }} onSave={() => { if (room) void action(() => { const input = parseForm(SetPositionRequest, { text: positionDraft }, 'position'); return setPosition(room.roomId, input.text) }, 'position') }}
    onReady={() => { if (room) void action(() => { if (!ownSeat?.ready) { parseForm(SetPositionRequest, { text: positionDraft }, 'position'); if (positionDraft.trim() !== room.setup.positions[room.you.slot]) throw new FormError({ position: 'Save your position before becoming ready.' }) }; return setReady(room.roomId, !ownSeat?.ready) }, 'ready') }}
    onRematch={() => { if (room) void action(() => requestRematch(room.roomId, room.debateId), 'rematch') }}
    onRetryJury={() => { if (room) void action(() => retryJury(room.roomId), 'juryRetry') }}
    onStart={() => { if (room) void action(() => startDebate(room.roomId), 'start') }} onSend={() => void send()} />
}
