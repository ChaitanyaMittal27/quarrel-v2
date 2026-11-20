import type { Pool } from "pg";
import { ResultDetail, ResultItem, type ResultDetail as Detail } from "@quarrel/shared/contract";

export type ArchiveData = Omit<Detail, "you" | "acknowledgedAt" | "decision">;
export class ResultsRepo {
  constructor(private readonly pool: Pool) {}
  async archive(data: ArchiveData, participants: { A: string; B: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO debates (id,room_id,theme,topic,duration_sec,position_a,position_b,name_a,name_b,transcript,summaries,verdict,created_at,completed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
      [data.debateId,data.roomId,data.theme,data.topic,data.durationSec,data.positions.A,data.positions.B,data.names.A,data.names.B,
        JSON.stringify(data.transcript),JSON.stringify(data.summaries),JSON.stringify(data.verdict),data.createdAt,data.completedAt]);
      for (const slot of ["A", "B"] as const) await client.query(`INSERT INTO debate_participants (debate_id,player_id,slot,completed_at)
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [data.debateId,participants[slot],slot,data.completedAt]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async list(playerId: string, roomId?: string) {
    const { rows } = await this.pool.query(`SELECT d.*, p.slot, p.acknowledged_at FROM debates d
      JOIN debate_participants p ON p.debate_id=d.id WHERE p.player_id=$1 AND ($2::text IS NULL OR d.room_id=$2)
      ORDER BY d.completed_at DESC, d.id DESC LIMIT 100`, [playerId,roomId ?? null]);
    return rows.map((row) => ResultItem.parse(mapRow(row)));
  }
  async get(playerId: string, debateId: string): Promise<Detail | null> {
    const { rows } = await this.pool.query(`SELECT d.*, p.slot, p.acknowledged_at FROM debates d
      JOIN debate_participants p ON p.debate_id=d.id WHERE p.player_id=$1 AND d.id=$2`, [playerId,debateId]);
    const row = rows[0];
    return row ? ResultDetail.parse({ ...mapRow(row), positions: { A: row.position_a, B: row.position_b }, transcript: row.transcript, summaries: row.summaries, verdict: row.verdict }) : null;
  }
  async acknowledge(playerId: string, debateId: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE debate_participants SET acknowledged_at=COALESCE(acknowledged_at,now()) WHERE debate_id=$1 AND player_id=$2`, [debateId,playerId]);
    return result.rowCount === 1;
  }
}
function mapRow(row: Record<string, any>) {
  return { debateId: row.id, roomId: row.room_id, theme: row.theme, topic: row.topic, durationSec: row.duration_sec,
    names: { A: row.name_a, B: row.name_b }, you: row.slot, decision: row.verdict.decision,
    createdAt: row.created_at.toISOString(), completedAt: row.completed_at.toISOString(), acknowledgedAt: row.acknowledged_at?.toISOString() ?? null };
}
