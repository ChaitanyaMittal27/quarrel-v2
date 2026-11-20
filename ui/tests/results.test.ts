import { Children, createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JuryVerdict, ResultDetail, type RoomSnapshot } from '@quarrel/shared/contract'
import { ResultsContent, ResultsPage } from '../src/results/ResultsPage'
import { getTheme } from '@quarrel/shared/config'
import { AfterGameControls } from '../src/results/AfterGame'
import { getResult, getResults, acknowledgeResult, requestRematch, ApiError } from '../src/lib/api'
import { feedbackFor, humanError } from '../src/game/errors'
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
const detail = ResultDetail.parse({ debateId: room.debateId, roomId: room.roomId, theme:'courtroom', topic:'A saved topic', durationSec:120,
  names:{ A:'Ann', B:'Bo' }, you:'A', decision:'tie', createdAt:room.createdAt, completedAt:room.serverNow, acknowledgedAt:null,
  positions:{ A:'A position', B:'B position' }, transcript:[], summaries:verdict.subtopicSummaries, verdict });
const { positions:_positions,transcript:_transcript,summaries:_summaries,verdict:_verdict,...listItem } = detail
function buttons(node: ReactNode): { children?: ReactNode; disabled?: boolean; onClick?: () => void }[] {
  return Children.toArray(node).flatMap((child) => isValidElement<{ children?: ReactNode; disabled?: boolean; onClick?: () => void }>(child) ? [...(child.type === 'button' ? [child.props] : []), ...buttons(child.props.children)] : [])
}
const render = (node: ReactNode) => renderToStaticMarkup(node)
afterEach(() => vi.unstubAllGlobals())
describe('Stage 8 results and rematch UI', () => {
  it('results shell has the same default theme canvas as Home, including loading state', () => {
    const markup = render(createElement(ResultsPage))
    expect(markup).toContain(`--art-canvas:${getTheme().palette.canvas}`)
    expect(markup).toContain('Loading your results')
  })
  it('rule 7.5: reviewed timestamp, read-not-agreement wording and action-local errors', () => {
    const r = { ...room, archivedAt:room.serverNow }, onReview = vi.fn()
    let node = AfterGameControls({room:r,acknowledgedAt:null,busy:false,onReview})
    buttons(node).find((b) => b.children === 'Mark as reviewed')!.onClick!(); expect(onReview).toHaveBeenCalledOnce()
    node = AfterGameControls({room:r,acknowledgedAt:room.serverNow,busy:false,reviewError:'Please try again.'})
    expect(render(node)).toContain('Reviewed'); expect(render(node)).toContain('not that you agree'); expect(render(node)).toContain('Please try again.')
    expect(buttons(node).some((b) => b.children === 'Mark as reviewed')).toBe(false)
  })
  it('rules 7.6-7.8: rematch callback, own waiting/opponent request, saving and closed reasons', () => {
    const r = { ...room, archivedAt:room.serverNow }, onRematch = vi.fn()
    let node = AfterGameControls({room:r,acknowledgedAt:null,busy:false,onRematch})
    const button = buttons(node).find((b) => b.children === 'Rematch')!; expect(button.disabled).toBe(false); button.onClick!(); expect(onRematch).toHaveBeenCalledOnce()
    node = AfterGameControls({room:{...r,rematch:{A:true,B:false}},acknowledgedAt:null,busy:false})
    expect(render(node)).toContain('Waiting for Bo'); expect(buttons(node).find((b) => b.children === 'Rematch')!.disabled).toBe(true)
    expect(render(AfterGameControls({room:{...r,rematch:{A:false,B:true}},acknowledgedAt:null,busy:false}))).toContain('Bo requested a rematch')
    for (const [changed,message] of [[{...r,closed:true},'Both original players']] as const) {
      const controls = AfterGameControls({room:changed,acknowledgedAt:null,busy:false}); expect(render(controls)).toContain(message); expect(buttons(controls).find((b) => b.children === 'Rematch')!.disabled).toBe(true)
    }
  })
  it('rules 7.2-7.5: list/detail, loading, empty/error states, public verdict and review callback', () => {
    const props = {items:[detail],detail:null,loading:false,error:'',busy:false,onRetry:vi.fn(),onReview:vi.fn()}
    expect(render(ResultsContent(props))).toContain('A saved topic'); expect(render(ResultsContent(props))).toContain('With Bo'); expect(render(ResultsContent(props))).toContain('Not reviewed')
    expect(render(ResultsContent({...props,items:[]}))).toContain('No completed debates yet')
    expect(render(ResultsContent({...props,loading:true}))).toContain('Loading your results')
    const error = ResultsContent({...props,error:'The server is unavailable.'}); buttons(error)[0]!.onClick!(); expect(props.onRetry).toHaveBeenCalledOnce()
    const shown = ResultsContent({...props,detail,reviewError:'Try reviewing again.'}); buttons(shown)[0]!.onClick!(); expect(props.onReview).toHaveBeenCalledOnce()
    expect(render(shown)).toContain('Public transcript'); expect(render(shown)).toContain('Saved summary'); expect(render(shown)).toContain('Try reviewing again.')
    expect(render(ResultsContent({...props,detail:{...detail,acknowledgedAt:room.serverNow}}))).toContain('Reviewed')
  })
  it('typed list/detail/ack/rematch requests parse strict contracts and retain session refresh retry', async () => {
    const request = vi.fn<typeof fetch>(); vi.stubGlobal('fetch',request)
    const response = (body: unknown,status=200) => new Response(JSON.stringify(body),{status})
    request.mockResolvedValueOnce(response({results:[listItem]})); await getResults(room.roomId)
    expect(request.mock.calls[0]![0]).toBe(`/api/results?roomId=${room.roomId}`)
    request.mockResolvedValueOnce(response({error:{code:'SESSION_EXPIRED',message:'Expired'}},401)).mockResolvedValueOnce(new Response(null,{status:204})).mockResolvedValueOnce(response({result:detail}))
    expect((await getResult(room.debateId)).result).toEqual(detail)
    request.mockResolvedValueOnce(response({result:{...detail,acknowledgedAt:room.serverNow}})); await acknowledgeResult(room.debateId)
    expect(request.mock.lastCall![0]).toBe(`/api/results/${room.debateId}/ack`); expect(request.mock.lastCall![1]?.method).toBe('POST')
    request.mockResolvedValueOnce(response({room})); await requestRematch(room.roomId,room.debateId)
    expect(JSON.parse(request.mock.lastCall![1]!.body as string)).toEqual({debateId:room.debateId})
    request.mockResolvedValueOnce(response({error:{code:'RESULTS_NOT_READY',message:'Raw details'}},409)); await expect(getResult(room.debateId)).rejects.toBeInstanceOf(ApiError)
    expect(feedbackFor(new ApiError('STALE_DEBATE','raw'),'rematch').buttons.rematch).toBeTruthy()
    expect(humanError(new ApiError('RESULTS_NOT_FOUND','raw'))).not.toContain('raw')
  })
})
