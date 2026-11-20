import { z } from "zod";
import { IsoDateTime, Slot, DebateId } from "./common";
import { RoomId, Theme, DurationSec, DebateMessage } from "./rooms";
import { JuryVerdict, PublicSummary } from "./judgment";

export const ResultParams = z.object({ debateId: DebateId });
export const ResultsQuery = z.strictObject({ roomId: RoomId.optional() });
export const RematchRequest = z.strictObject({ debateId: DebateId });
export const ResultItem = z.strictObject({
  debateId: DebateId, roomId: RoomId, theme: Theme, topic: z.string(), durationSec: DurationSec,
  names: z.strictObject({ A: z.string(), B: z.string() }), you: Slot,
  decision: JuryVerdict.shape.decision, createdAt: IsoDateTime, completedAt: IsoDateTime,
  acknowledgedAt: IsoDateTime.nullable(),
});
export type ResultItem = z.infer<typeof ResultItem>;
export const ResultDetail = ResultItem.extend({ positions: z.strictObject({ A: z.string(), B: z.string() }),
  transcript: z.array(DebateMessage), summaries: z.array(PublicSummary), verdict: JuryVerdict });
export type ResultDetail = z.infer<typeof ResultDetail>;
export const ResultsResponse = z.strictObject({ results: z.array(ResultItem).max(100) });
export const ResultResponse = z.strictObject({ result: ResultDetail });
export type ResultResponse = z.infer<typeof ResultResponse>;
