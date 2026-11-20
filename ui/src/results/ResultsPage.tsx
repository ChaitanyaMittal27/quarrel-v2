import { useEffect, useState } from 'react'
import type { ResultDetail, ResultItem } from '@quarrel/shared/contract'
import { getResult, getResults, acknowledgeResult } from '../lib/api'
import { humanError } from '../game/errors'
import { VerdictView } from '../game/Judgment'
import { loadDisplayPreferences } from '../settings/display-preferences'

export function ResultsContent({ items, detail, loading, error, busy, onRetry, onReview, reviewError }: { items: ResultItem[]; detail: ResultDetail | null; loading: boolean; error: string; busy: boolean; onRetry: () => void; onReview: () => void; reviewError?: string }) {
  if (loading) return <p role="status">Loading your results...</p>
  if (error) return <section className="game-panel"><p role="alert">{error}</p><button onClick={onRetry}>Try again</button></section>
  if (!detail) return <section className="game-panel"><h1>My results</h1>{!items.length ? <p>No completed debates yet.</p> : <ul className="game-results">{items.map((r) => <li key={r.debateId}><a href={`#/results/${r.debateId}`}><h2>{r.topic}</h2></a>
    <p>With {r.names[r.you === 'A' ? 'B' : 'A']} · {new Date(r.completedAt).toLocaleString()}</p><p>Decision: {r.decision} · {r.acknowledgedAt ? 'Reviewed' : 'Not reviewed'}</p></li>)}</ul>}</section>
  return <><section className="game-panel"><a href="#/results">All my results</a><h1>{detail.topic}</h1><p>{new Date(detail.completedAt).toLocaleString()}</p>
    {detail.acknowledgedAt ? <p>Reviewed {new Date(detail.acknowledgedAt).toLocaleString()}</p> : <button disabled={busy} onClick={onReview}>Mark as reviewed</button>}{reviewError && <p className="game-field-error" role="alert">{reviewError}</p>}<p>Reviewed means read, not agreement.</p></section>
    <VerdictView verdict={detail.verdict} names={detail.names} messages={detail.transcript} />
    <section className="game-panel"><h2>Public transcript</h2><ol>{detail.transcript.map((m) => <li key={m.id}><strong>{m.slot ? detail.names[m.slot] : 'Court record'} {m.label}</strong><p className="game-prose">{m.text}</p></li>)}</ol></section></>
}
export function ResultsPage({ debateId }: { debateId?: string }) {
  const [items, setItems] = useState<ResultItem[]>([]), [detail, setDetail] = useState<ResultDetail | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const [reviewError, setReviewError] = useState(''), [display] = useState(loadDisplayPreferences)
  useEffect(() => {
    let active = true
    const request = debateId ? getResult(debateId).then((r) => { if (active) setDetail(r.result) }) : getResults().then((r) => { if (active) setItems(r.results) })
    void request.catch((e: unknown) => { if (active) setError(humanError(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [debateId, revision])
  async function review() {
    if (!debateId) return
    setBusy(true); setReviewError('')
    try { setDetail((await acknowledgeResult(debateId)).result) } catch (e) { setReviewError(humanError(e)) } finally { setBusy(false) }
  }
  return <div className="art-scope game-shell" data-text-size={display.preferences.textSize}><header className="game-header"><a className="game-brand" href="#/">quarrel.io</a><a href="#/">Back to game</a></header><main className="game-content">
    <ResultsContent items={items} detail={detail} loading={loading} error={error} busy={busy} reviewError={reviewError} onReview={() => void review()} onRetry={() => { setLoading(true); setError(''); setRevision(revision + 1) }} />
  </main></div>
}
