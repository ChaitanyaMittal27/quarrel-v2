import { describe, expect, it } from 'vitest';
import { DebateId, RematchRequest, ResultsQuery, ResultItem, ResultDetail, ResultsResponse } from '../contract';
const item = { debateId:'d_AAAAAAAAAAAAAAAAAAAAAA',roomId:'r_AAAAAAAAAAAAAAAAAAAAAA',theme:'courtroom',topic:'Topic',durationSec:120,
  names:{A:'Ann',B:'Bo'},you:'A',decision:'inconclusive',createdAt:'2030-01-01T00:00:00Z',completedAt:'2030-01-01T00:01:00Z',acknowledgedAt:null };
describe('Stage 8 strict contract', () => {
  it('debate identity, strict rematch body and room filter', () => {
    expect(DebateId.safeParse(item.debateId).success).toBe(true); expect(DebateId.safeParse('bad').success).toBe(false);
    expect(RematchRequest.parse({debateId:item.debateId})).toEqual({debateId:item.debateId});
    for (const body of [{},{debateId:item.debateId,playerId:'private'}]) expect(RematchRequest.safeParse(body).success).toBe(false);
    expect(ResultsQuery.parse({roomId:item.roomId})).toEqual({roomId:item.roomId}); expect(ResultsQuery.safeParse({extra:true}).success).toBe(false);
  });
  it('strict per-player list and detail with required public fields; maximum 100', () => {
    expect(ResultItem.parse(item)).toEqual(item);
    expect(ResultItem.safeParse({...item,playerId:'private'}).success).toBe(false);
    expect(ResultItem.safeParse({...item,names:{...item.names,playerId:'private'}}).success).toBe(false);
    expect(ResultsResponse.safeParse({results:Array(100).fill(item)}).success).toBe(true);
    expect(ResultsResponse.safeParse({results:Array(101).fill(item)}).success).toBe(false);
    expect(ResultDetail.safeParse({...item,transcript:[],drafts:[]}).success).toBe(false);
  });
});
