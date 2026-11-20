import type { RoomSnapshot } from '@quarrel/shared/contract'
import { countdown, sendDisabledReason, startDisabledReason } from '../lib/debate'
import { Field } from './Field'
import type { FieldErrors, ButtonErrors, FocusRequest } from './errors'
import { JudgmentScreen } from './Judgment'
import { Consultations } from './Consultations'

export interface RoomScreenProps {
  room: RoomSnapshot; busy: boolean; position: string; argument: string; receivedAt: number; now: number
  onPosition: (text: string) => void; onArgument: (text: string) => void
  onSave: () => void; onReady: () => void; onStart: () => void; onSend: () => void
  fieldErrors?: FieldErrors; buttonErrors?: ButtonErrors; focus?: FocusRequest
  onRetryJury?: () => void
  question?: string; onQuestion?: (text: string) => void; onAsk?: () => void
}
export function Transcript({ room }: { room: RoomSnapshot }) {
  return <section className="game-panel game-transcript" aria-label="Transcript"><h2>The hearing</h2>
    {room.messages.length === 0 && <p>The transcript will appear here.</p>}
    <ol>{room.messages.map((m) => <li key={m.id} data-kind={m.kind}><strong>{m.kind === 'judge_summary' ? 'Judge' : m.kind === 'announcement' ? 'Court record' : room.players.find((p) => p.slot === m.slot)?.name}</strong>{m.source && m.source !== 'ai' && <small className="game-source">{m.source === 'demo' ? 'Demo' : 'Fallback'}</small>}<p className="game-prose">{m.text}</p></li>)}</ol>
  </section>
}
export function RoomScreen(p: RoomScreenProps) {
  const { room, busy } = p
  const phase = room.setup.phase
  const own = room.players.find((s) => s.slot === room.you.slot)!
  const other = room.players.find((s) => s.slot !== room.you.slot)
  const frozen = busy || room.closed
  if (room.closed && !['ended', 'complete'].includes(phase)) return <section className="game-panel"><h2>Room closed</h2><p>A player left this hearing. Leave to create or join another room.</p><Transcript room={room} /></section>
  if (['summary', 'jury', 'complete'].includes(phase)) return <><JudgmentScreen room={room} busy={busy} receivedAt={p.receivedAt} now={p.now} onRetry={p.onRetryJury} error={p.buttonErrors?.juryRetry} /><Transcript room={room} /></>
  if (phase === 'waiting') return <section className="game-panel"><p className="game-eyebrow">A SEAT IS SAVED</p><h2>Waiting for opponent</h2><p>Share the room code above. Your question and theme are ready.</p></section>
  if (phase === 'positions') {
    const saved = room.setup.positions[room.you.slot] ?? ''
    // The contract trims positions; cosmetic edge whitespace is not an unsaved change.
    const dirty = p.position.trim() !== saved
    return <section className="game-panel"><p className="game-eyebrow">BEFORE THE HEARING</p><h2>Where do you stand?</h2>
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (!frozen) p.onSave() }}>
        <Field name="position" label="Your position" error={p.fieldErrors?.position} focus={p.focus}><textarea rows={5} value={p.position} disabled={frozen} onChange={(e) => p.onPosition(e.target.value)} /></Field>
        <p>{[...p.position].length}/600 characters</p><button disabled={busy}>Save position</button>
        {p.buttonErrors?.position && <p className="game-field-error">{p.buttonErrors.position}</p>}
      </form>
      <div className="game-opponent"><h3>{other?.name ?? 'Opponent'}'s position</h3><p className="game-prose">{room.setup.positions[room.you.slot === 'A' ? 'B' : 'A'] ?? 'Still making their case…'}</p>
        <p>{other?.ready ? 'Ready' : 'Not ready'} · {other?.connected ? 'Connected' : 'Disconnected'}</p></div>
      <button disabled={busy} onClick={p.onReady}>{own.ready ? 'Not ready' : 'Ready'}</button>
      {p.buttonErrors?.ready && <p className="game-field-error">{p.buttonErrors.ready}</p>}
      <p>{dirty ? 'Save your position before becoming ready.' : own.ready ? 'You are ready. Waiting for your opponent.' : 'Both players ready locks your positions.'}</p>
    </section>
  }
  if (phase === 'planning') {
    const reason = p.buttonErrors?.start ?? startDisabledReason(room)
    return <section className="game-panel"><p className="game-eyebrow">THE RUN OF SHOW</p><h2>{room.plan ? 'Your debate plan' : 'Preparing the debate…'}</h2>
      {room.plan ? <><p>{room.plan.text}</p><ol className="game-plan">{room.plan.subtopics.map((s) => <li key={s.ordinal}><h3>{s.question}</h3><p>{s.secondsPerPlayer} seconds each · {room.players.find((p) => p.slot === s.openerSlot)?.name ?? s.openerSlot} opens</p></li>)}</ol></> : <p role="status">Your positions are locked. The plan will appear here automatically.</p>}
      {room.you.slot === 'A' ? <><button disabled={busy || reason !== null} aria-describedby={reason ? 'start-reason' : undefined} onClick={p.onStart}>Start debate</button>{reason && <p id="start-reason">{reason}</p>}</> : <p>Waiting for the host to start.</p>}
    </section>
  }
  const seconds = room.startsAt ? countdown(room.startsAt, room.serverNow, p.receivedAt, p.now) : 0
  if (phase === 'ended') return <><section className="game-panel"><p className="game-eyebrow">THAT'S A WRAP</p><h2>Debate ended</h2><p>Two perspectives. One fair hearing. Your transcript is below.</p></section><Transcript room={room} /></>
  // Input validity is checked on submit, separately from turn/clock preconditions.
  const reason = p.buttonErrors?.send ?? sendDisabledReason(room, 'argument', p.receivedAt, p.now)
  const yourTurn = seconds === 0 && room.debate?.activeSlot === room.you.slot
  const working = room.debate?.state === 'lawyering' || room.debate?.state === 'consulting'
  const ownWork = room.debate?.state === 'consulting' || room.debate?.drafts.some((d) => d.status === 'pending')
  return <>
    <section className="game-panel"><p className="game-eyebrow">SUBTOPIC {room.debate?.ordinal}</p><h2>{room.plan?.subtopics.find((s) => s.ordinal === room.debate?.ordinal)?.question}</h2>
      {seconds > 0 ? <div className="game-countdown" role="status">Starting in <strong>{seconds}</strong></div> : <p role="status">Debate started · {yourTurn ? 'Your turn' : `${other?.name ?? 'Opponent'}'s turn`}</p>}
    </section>
    <Transcript room={room} />
    {working && <section className="game-panel" role="status"><h2>{ownWork ? 'Your lawyer is preparing…' : 'Their lawyer is at work'}</h2><p>Both clocks are paused.</p>
      {room.debate?.drafts.filter((draft) => draft.status === 'pending').map((draft) => <p key={draft.id} className="game-prose">{draft.text}</p>)}
    </section>}
    <section className="game-panel"><form noValidate onSubmit={(e) => { e.preventDefault(); if (!busy && !reason) p.onSend() }}>
      <Field name="argument" label="Your argument" error={p.fieldErrors?.argument} focus={p.focus}><textarea rows={4} value={p.argument} disabled={frozen || !yourTurn} onChange={(e) => p.onArgument(e.target.value)} placeholder={yourTurn ? 'Make your case…' : 'Listen to the other side…'} /></Field>
      <p>{[...p.argument].length}/600 characters · {room.debate?.yourArgumentsThisSubtopic ?? 0}/12 arguments this subtopic</p>
      <button disabled={busy || reason !== null} aria-describedby={reason ? 'send-reason' : undefined}>Send</button>{reason && <p id="send-reason">{reason}</p>}
    </form></section>
    {room.debate && <Consultations room={room} question={p.question ?? ''} busy={busy} receivedAt={p.receivedAt} now={p.now}
      onQuestion={p.onQuestion ?? (() => {})} onAsk={p.onAsk ?? (() => {})} fieldErrors={p.fieldErrors} buttonErrors={p.buttonErrors} focus={p.focus} />}
  </>
}
