import { useEffect, useState } from 'react'
import type { RoomSnapshot } from '@quarrel/shared/contract'
import { getResult, acknowledgeResult } from '../lib/api'
import { humanError } from '../game/errors'

export function AfterGameControls({ room, acknowledgedAt, busy, onReview, onRematch, error, reviewError }: { room: RoomSnapshot; acknowledgedAt: string | null; busy: boolean; onReview?: () => void; onRematch?: () => void; error?: string; reviewError?: string }) {
  const other = room.players.find((p) => p.slot !== room.you.slot)
  const requested = room.rematch[room.you.slot]
  const reason = room.closed || room.players.length !== 2 || room.players.some((p) => p.left) ? 'Both original players must still be seated.'
    : requested ? `Waiting for ${other?.name ?? 'your opponent'}.` : null
  return <section className="game-panel"><h2>After the hearing</h2>
    {acknowledgedAt ? <p>Reviewed {new Date(acknowledgedAt).toLocaleString()}</p> : <button disabled={busy || !room.archivedAt} onClick={onReview}>Mark as reviewed</button>}
    {reviewError && <p className="game-field-error" role="alert">{reviewError}</p>}
    {!room.archivedAt && <p>Saving your result...</p>}
    <p>Reviewed means you have read it, not that you agree.</p>
    <button disabled={busy || reason !== null} onClick={onRematch} aria-describedby="rematch-reason">Rematch</button>
    <p id="rematch-reason">{error ?? reason ?? 'Play again with the same topic, theme and duration.'}</p>
    {other && room.rematch[other.slot] && <p>{other.name} requested a rematch.</p>}
    <a href={`#/results/${room.debateId}`}>View saved result</a>
  </section>
}
export function AfterGame({ room, busy, onRematch, error }: { room: RoomSnapshot; busy: boolean; onRematch?: () => void; error?: string }) {
  const [ack, setAck] = useState<string | null>(null), [saving, setSaving] = useState(false), [failure, setFailure] = useState('')
  useEffect(() => {
    let active = true
    if (room.archivedAt) void getResult(room.debateId).then((r) => { if (active) setAck(r.result.acknowledgedAt) }).catch(() => { /* Review click retries with action-local feedback. */ })
    return () => { active = false }
  }, [room.debateId, room.archivedAt])
  async function review() {
    setSaving(true); setFailure('')
    try { setAck((await acknowledgeResult(room.debateId)).result.acknowledgedAt) }
    catch (e) { setFailure(humanError(e)) } finally { setSaving(false) }
  }
  return <AfterGameControls room={room} acknowledgedAt={ack} busy={busy || saving} onReview={() => void review()} onRematch={onRematch} error={error} reviewError={failure} />
}
