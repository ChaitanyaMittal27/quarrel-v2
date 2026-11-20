import type { RoomSnapshot, JuryVerdict, DebateMessage } from '@quarrel/shared/contract'
import { juryReasons, retrySeconds } from '../lib/judgment'

export function SummaryCard({ room }: { room: RoomSnapshot }) {
  const summary = room.summary?.current
  return <section className="game-panel game-summary" role="status"><h2>{summary ? 'The judge summarizes' : 'Preparing the summary...'}</h2>
    {summary && <><span className="game-source">{summary.source === 'ai' ? 'AI summary' : summary.source === 'demo' ? 'Demo summary' : 'Fallback: unverified public points'}</span><p className="game-prose">{summary.text}</p></>}
    <p>Both clocks are paused.</p></section>
}
export function JudgmentScreen({ room, busy, receivedAt, now, onRetry, error }: { room: RoomSnapshot; busy: boolean; receivedAt: number; now: number; onRetry?: () => void; error?: string }) {
  if (room.setup.phase === 'summary') return <section className="game-panel"><h2>Subtopic {room.debate?.ordinal} complete</h2><p>The next stage follows the judge's summary automatically. Both clocks are paused.</p></section>
  if (room.jury) {
    const seconds = retrySeconds(room, receivedAt, now)
    return <section className="game-panel"><h2>The jury is deliberating...</h2><p>Both clocks are paused.</p>
      {room.jury.status === 'retry_required' ? <><p>{room.jury.errorCode ? juryReasons[room.jury.errorCode] : 'The jury could not finish.'}</p>
        <button disabled={busy || seconds > 0} onClick={onRetry} aria-describedby="jury-retry-reason">Retry jury</button>
        <p id="jury-retry-reason">{error ?? (seconds > 0 ? `Retry available in ${seconds}s.` : 'Either player can retry.')}</p></> : <p role="status">The verdict will appear automatically.</p>}
    </section>
  }
  const v = room.verdict
  if (!v) return null
  return <VerdictView verdict={v} names={{ A: room.players[0]!.name, B: room.players[1]?.name ?? 'Opponent' }} messages={room.messages} />
}
export function VerdictView({ verdict: v, names, messages }: { verdict: JuryVerdict; names: Record<'A' | 'B', string>; messages: DebateMessage[] }) {
  return <section className="game-panel game-verdict"><p className="game-eyebrow">THE HEARING IS COMPLETE</p><h2>{v.source === 'demo' ? 'Demo verdict, not a real judgment' : v.source === 'safety' ? 'Safety notice: no competitive judgment' : 'Jury verdict'}</h2>
    <h3>Decision: {v.decision === 'A' || v.decision === 'B' ? names[v.decision] : v.decision}</h3><p>{v.text}</p><p>{v.reasoning}</p>
    {(['A', 'B'] as const).map((slot) => <section key={slot}><h3>{names[slot]}: strongest argument</h3><p>{v.strongestArguments[slot]}</p>
      {messages.filter((m) => m.kind === 'argument' && m.slot === slot && m.label && v.strongestArguments[slot].includes(m.label)).map((m) => <blockquote key={m.id}><cite>{m.label}</cite><p>{m.text}</p></blockquote>)}
      <h4>Weaknesses</h4>{v.weaknesses[slot].length ? <ul>{v.weaknesses[slot].map((w, i) => <li key={i}>{w}</li>)}</ul> : <p>None assessed.</p>}</section>)}
    {v.perSubtopic.map((finding) => <section key={finding.ordinal}><h3>Subtopic {finding.ordinal}</h3><p>{finding.text}</p><h4>Saved summary</h4><p>{v.subtopicSummaries.find((s) => s.ordinal === finding.ordinal)?.text}</p></section>)}
    {v.compromise && <section><h3>Possible compromise</h3><p>{v.compromise}</p></section>}
  </section>
}
