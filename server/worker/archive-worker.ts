import type { Job } from "bullmq";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import { ResultDetail, PublicSummary, DebateMessage, JuryVerdict } from "@quarrel/shared/contract";
import { RoomRepo } from "../rooms/room-repo";
import { ResultsRepo } from "../results/results-repo";
import type { ArchiveJobData } from "../rooms/plan-queue";
import { ROOM_EVENTS_CHANNEL } from "../rooms/room-pubsub";

export function createArchiveProcessor(redis: Redis, pool: Pool) {
  const rooms = new RoomRepo(redis), results = new ResultsRepo(pool);
  return async (job: Job<ArchiveJobData>): Promise<void> => {
    const { roomId, debateId } = job.data;
    const input = await rooms.archiveInput(roomId, debateId);
    if (!input) return;
    const f = input.fields;
    const summaries = PublicSummary.array().parse(JSON.parse(f.summaries!).map((s: { at: number }) => ({ ...s, at: new Date(s.at).toISOString() })));
    const verdict = JuryVerdict.parse({ ...JSON.parse(f.verdict!), subtopicSummaries: summaries });
    const transcript = input.messages.map((raw) => {
      const m = JSON.parse(raw);
      return DebateMessage.parse({ id: m.id, ordinal: m.ordinal, kind: m.kind, slot: m.slot, text: m.text,
        at: new Date(m.at).toISOString(), ...(m.label ? { label: m.label } : {}), ...(m.source ? { source: m.source } : {}) });
    });
    const full = ResultDetail.parse({ debateId, roomId, theme: f.theme, topic: f.topic, durationSec: Number(f.durationSec),
      names: { A: f['a.name'], B: f['b.name'] }, positions: { A: f['a.position'], B: f['b.position'] }, transcript, summaries, verdict,
      decision: verdict.decision, you: 'A', acknowledgedAt: null,
      createdAt: new Date(Number(f.debateCreatedAt ?? f.createdAt)).toISOString(), completedAt: new Date(Number(f.completedAt ?? input.now)).toISOString() });
    const { you: _you, acknowledgedAt: _ack, decision: _decision, ...data } = full;
    await results.archive(data, { A: f['a.player']!, B: f['b.player']! });
    const saved = await rooms.markArchived(roomId, debateId);
    if (saved.changed) await redis.publish(ROOM_EVENTS_CHANNEL, roomId);
  };
}
