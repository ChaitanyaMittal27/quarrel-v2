import { createElement, Children, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JuryFailureCode, JuryVerdict, type RoomSnapshot } from '@quarrel/shared/contract'
import { juryReasons, retrySeconds } from '../src/lib/judgment'
import { SummaryCard, JudgmentScreen } from '../src/game/Judgment'
import { RoomStage } from '../src/components/art/RoomStage'
import { RoomScreen } from '../src/game/RoomScreen'
import { defaultDisplayPreferences } from '../src/settings/display-preferences'
import { retryJury } from '../src/lib/api'
const room: RoomSnapshot = {
  roomId: 'r_AAAAAAAAAAAAAAAAAAAAAA', code: 'ABC234', version: 1, createdAt: '2030-01-01T00:00:00Z',
  expiresAt: '2030-01-02T00:00:00Z', serverNow: '2030-01-01T00:00:01Z', closed: false, bothReady: false,
  setup: { phase: 'positions', theme: 'courtroom', topic: 'Topic', durationSec: 120, positions: { A: null, B: null } },
  plan: null, startsAt: null, debate: null, messages: [], speech: [], debateId: "d_AAAAAAAAAAAAAAAAAAAAAA", archivedAt: null, rematch: { A: false, B: false }, summaries: [], summary: null, jury: null, verdict: null, you: { slot: 'A' },
  players: [
    { slot: 'A', name: 'Ann', characterId: 'jungle-zebra', lawyerId: 'detective-arden', ready: false, connected: true, left: false },
    { slot: 'B', name: 'Bo', characterId: 'superhero-inventor', lawyerId: 'courtroom-sage', ready: false, connected: true, left: false },
  ],
}

const summary = { ordinal: 1, text: 'Player A offered a point. Player B offered another point.', source: 'demo' as const, at: room.serverNow }
const verdict = JuryVerdict.parse({ source: 'ai', text: 'The reasons balance.', decision: 'tie', outcome: 'split', topic: 'Topic', positionA: 'A position', positionB: 'B position',
  reasoning: 'Evidence remains uncertain.', strongestArguments: { A: '[S1-P1L1M1] A public reason.', B: '[S1-P2L2M2] B public reason.' },
  weaknesses: { A: ['Limited evidence.'], B: [] }, perSubtopic: [{ ordinal: 1, text: 'A finding.' }, { ordinal: 2, text: 'Another finding.' }],
  compromise: 'Try a shared space.', subtopicSummaries: [summary, { ...summary, ordinal: 2 }] })
const render = (r: RoomSnapshot, options = {}) => renderToStaticMarkup(createElement(JudgmentScreen, { room: r, busy: false, receivedAt: 100, now: 100, ...options }))
function buttons(node: ReactNode): { disabled?: boolean; onClick?: () => void }[] {
  return Children.toArray(node).flatMap((child) => isValidElement<{ children?: ReactNode; disabled?: boolean; onClick?: () => void }>(child) ? [...(child.type === 'button' ? [child.props] : []), ...buttons(child.props.children)] : [])
}
afterEach(() => vi.unstubAllGlobals())
describe('Stage 7 judgment UI', () => {
  it('rule 6.11: summary card labels sources, pauses clocks and animates the judge for showUntil', () => {
    const r: RoomSnapshot = { ...room, setup: { ...room.setup, phase: 'summary' }, summaries: [summary], summary: { ordinal: 1, current: summary, showUntil: '2030-01-01T00:00:05Z' } }
    const text = renderToStaticMarkup(createElement(SummaryCard, { room: r }))
    expect(text).toContain('Demo summary'); expect(text).toContain(summary.text); expect(text).toContain('Both clocks are paused')
    expect(render(r)).toContain('Subtopic')
    const scene = renderToStaticMarkup(createElement(RoomStage, { room: r, receivedAt: 100, now: 100, preferences: defaultDisplayPreferences, judgeSpeaking:true }))
    expect(scene).toContain('data-type="judge" data-state="speaking"')
    for (const source of ['ai', 'fallback'] as const) expect(renderToStaticMarkup(createElement(SummaryCard, { room: { ...r, summary: { ...r.summary!, current: { ...summary, source } } } }))).toContain(source === 'ai' ? 'AI summary' : 'Fallback')
    expect(renderToStaticMarkup(createElement(SummaryCard, { room: { ...r, summary: { ...r.summary!, current: null } } }))).toContain('Preparing the summary')
  })
  it('rules 6.20,6.21: pending and retry states show human reasons, cooldown and an active retry callback', () => {
    const r: RoomSnapshot = { ...room, setup: { ...room.setup, phase: 'jury' }, jury: { status: 'pending', errorCode: null, retryAvailableAt: null } }
    expect(render(r)).toContain('The jury is deliberating'); expect(render(r)).not.toContain('Retry jury')
    r.jury = { status: 'retry_required', errorCode: 'rate_limited', retryAvailableAt: '2030-01-01T00:00:11Z' }
    expect(retrySeconds(r, 100, 100)).toBe(10); expect(render(r)).toContain('Retry available in 10s')
    const onRetry = vi.fn()
    let control = buttons(JudgmentScreen({ room: r, busy: false, receivedAt: 100, now: 100, onRetry }))[0]!
    expect(control.disabled).toBe(true)
    control = buttons(JudgmentScreen({ room: r, busy: false, receivedAt: 100, now: 10100, onRetry }))[0]!
    expect(control.disabled).toBe(false); control.onClick!(); expect(onRetry).toHaveBeenCalledOnce()
    expect(render(r, { error: 'Please wait before retrying.' })).toContain('Please wait before retrying.')
    expect(Object.keys(juryReasons).sort()).toEqual([...JuryFailureCode.options].sort())
    for (const code of JuryFailureCode.options) { r.jury.errorCode = code; const text = render(r); expect(text).not.toContain(code); expect(text).toContain(juryReasons[code]) }
  })
  it('rules 6.14-6.18: verdict renders findings, summaries, real citations, weaknesses and compromise; demo/safety clearly labelled', () => {
    const r: RoomSnapshot = { ...room, setup: { ...room.setup, phase: 'complete' }, verdict, messages: [
      { id: 'm1', label: 'S1-P1L1M1', ordinal: 1, kind: 'argument', source: 'ai', text: 'Actual public A presentation.', slot: 'A', at: room.serverNow },
      { id: 'm2', label: 'S1-P2L2M2', ordinal: 1, kind: 'argument', source: 'ai', text: 'Actual public B presentation.', slot: 'B', at: room.serverNow },
    ] }
    const html = render(r)
    for (const text of ['Decision: tie', 'Actual public A presentation.', 'Actual public B presentation.', 'Limited evidence.', 'A finding.', summary.text, 'Try a shared space.']) expect(html).toContain(text)
    expect(render({ ...r, verdict: { ...verdict, source: 'demo' } })).toContain('Demo verdict, not a real judgment')
    expect(render({ ...r, verdict: { ...verdict, source: 'safety' } })).toContain('Safety notice: no competitive judgment')
    expect(render({ ...r, verdict: null })).toBe('')
    const closed = renderToStaticMarkup(createElement(RoomScreen, { room: { ...r, closed: true }, busy: false, position: '', argument: '', receivedAt: 100, now: 100,
      onPosition: vi.fn(), onArgument: vi.fn(), onSave: vi.fn(), onReady: vi.fn(), onStart: vi.fn(), onSend: vi.fn() }))
    expect(closed).toContain('Jury verdict'); expect(closed).not.toContain('Room closed')
  })
  it('manual retry uses the typed API and the new strict response contract', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ room }), { status: 200 }))
    vi.stubGlobal('fetch', request); await retryJury(room.roomId)
    expect(request.mock.calls[0]![0]).toBe(`/api/rooms/${room.roomId}/jury/retry`)
    expect(request.mock.calls[0]![1]?.method).toBe('POST')
  })
  it('shows a demo/safety notice once near the title, including old archives with duplicated notice text', () => {
    for (const [source, label, text] of [
      ['demo', 'Demo verdict, not a real judgment', 'Demo verdict, not a real judgment'],
      ['safety', 'Safety notice: no competitive judgment', 'Safety notice: a competitive judgment is not appropriate.'],
    ] as const) {
      const markup = render({ ...room, verdict: { ...verdict, source, text, reasoning: text } })
      expect(markup.split(label)).toHaveLength(2)
      expect(markup).toContain('<h2>Jury verdict</h2><p class="game-verdict-label">')
      if (source === 'safety') expect(markup.split('a competitive judgment is not appropriate.')).toHaveLength(2)
    }
  })
  it('shows equal finding/summary text once and retains distinct saved summaries', () => {
    const markup = render({ ...room, verdict: { ...verdict, perSubtopic: [{ ordinal: 1, text: summary.text }, { ordinal: 2, text: 'Distinct finding.' }] } })
    expect(markup.split(summary.text)).toHaveLength(3) // Once for each of the two subtopics.
    expect(markup.split('Saved summary')).toHaveLength(2) // Only the distinct pair gets a second block.
    expect(markup).toContain('Distinct finding.')
    const missing = render({ ...room, verdict: { ...verdict, subtopicSummaries: [] } })
    expect(missing).not.toContain('Saved summary')
  })
})
