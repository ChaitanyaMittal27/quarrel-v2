import type { RoomSnapshot } from '@quarrel/shared/contract'
import { sendDisabledReason } from '../lib/debate'
import { Field } from './Field'
import type { ButtonErrors, FieldErrors, FocusRequest } from './errors'

export function Consultations({ room, question, busy, receivedAt, now, onQuestion, onAsk, fieldErrors, buttonErrors, focus }: {
  room: RoomSnapshot; question: string; busy: boolean; receivedAt: number; now: number
  onQuestion: (text: string) => void; onAsk: () => void; fieldErrors?: FieldErrors; buttonErrors?: ButtonErrors; focus?: FocusRequest
}) {
  const debate = room.debate!
  const reason = buttonErrors?.consult ?? sendDisabledReason(room, 'question', receivedAt, now, 'consult')
  const history = debate.consultations.filter((c) => c.ordinal === debate.ordinal)
  return <section className="game-panel game-consult" aria-label="Private consultation"><h2>Ask your lawyer</h2>
    <p>Only you can see this conversation. {debate.consultsLeft}/2 consultations left.</p>
    {history.map((c) => <article key={c.id}><strong>Your question</strong><p className="game-prose">{c.question}</p>
      <strong>Your lawyer</strong><p className="game-prose">{c.answer ?? 'Your lawyer is preparing…'}</p></article>)}
    <form noValidate onSubmit={(e) => { e.preventDefault(); if (!busy && !reason) onAsk() }}>
      <Field name="consultation" label="Your private question" error={fieldErrors?.consultation} focus={focus}>
        <textarea rows={3} value={question} onChange={(e) => onQuestion(e.target.value)} disabled={busy || reason !== null} />
      </Field><button disabled={busy || reason !== null} aria-describedby={reason ? 'consult-reason' : undefined}>Ask your lawyer</button>
      {reason && <p id="consult-reason">{reason}</p>}
    </form>
  </section>
}

/** These records already passed the per-player mapper; there is no opponent lookup here. */
export function PrivateNotes({ room }: { room: RoomSnapshot }) {
  if (!room.debate) return null
  return <details className="game-panel game-private"><summary>Your private drafts and consultations</summary>
    <h3>Your original drafts</h3>{room.debate.drafts.map((d) => <article key={d.id}><strong>Subtopic {d.ordinal} / {d.status}</strong><p className="game-prose">{d.text}</p></article>)}
    <h3>Your private consultations</h3>{room.debate.consultations.map((c) => <article key={c.id}><strong>Subtopic {c.ordinal}</strong><p className="game-prose">{c.question}</p><p className="game-prose">{c.answer ?? 'Awaiting your lawyer'}</p></article>)}
  </details>
}
