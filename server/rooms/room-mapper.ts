import { speakableItems } from "@quarrel/shared/speech";
import { DebatePlan, JuryVerdict, PublicSummary, type RoomSnapshot, type PlayerView } from "@quarrel/shared/contract";
import type { RoomRead } from "./room-repo";
import { getTheme, resolveCharacter, resolveLawyer } from "@quarrel/shared/config";

/** Rules 1.7, 1.12, 1.14, 1.17: explicitly allowlist public fields, retaining vacated seats. */
export function mapRoom(room: RoomRead, viewerId: string): RoomSnapshot {
  const { fields, now, presence } = room;
  const theme = getTheme(fields.theme);
  const players: PlayerView[] = [];
  let you: RoomSnapshot["you"] | undefined;
  for (const [index, prefix] of ["a", "b"].entries()) {
    const playerId = fields[`${prefix}.player`];
    if (!playerId) continue;
    const slot = prefix === "a" ? "A" : "B";
    const left = fields[`${prefix}.left`] === "1";
    players.push({ slot, name: fields[`${prefix}.name`]!, ready: fields[`${prefix}.ready`] === "1",
      characterId: resolveCharacter(fields[`${prefix}.characterId`], theme, slot).id,
      lawyerId: resolveLawyer(fields[`${prefix}.lawyerId`], theme, slot).id,
      left, connected: Boolean(presence[index]) && !left });
    if (playerId === viewerId && !left) you = { slot };
  }
  if (!you) throw new Error("Snapshot viewer has no active seat");
  const clocks = { A: Number(fields["a.remainingMs"]), B: Number(fields["b.remainingMs"]) };
  // Existing Stage 4/5 rooms had only composing turns and directly published raw arguments.
  const state = fields.state ?? "composing";
  const composing = fields.phase === "debate" && state === "composing";
  const activeSlot = (composing ? fields.activeSlot || null : null) as "A" | "B" | null;
  if (activeSlot && fields.deadline) clocks[activeSlot] = Math.max(0, Math.min(clocks[activeSlot], Number(fields.deadline) - now));
  const summaries = JSON.parse(fields.summaries ?? "[]").map((entry: { at: number }) => ({ ...entry, at: new Date(entry.at).toISOString() }));
  const verdict = fields.verdict ? JSON.parse(fields.verdict) : null;
  if (verdict) verdict.subtopicSummaries = summaries;
  const publicInput = { debateId: fields.debateId!, theme: fields.theme!, lawyers: { A: fields['a.lawyerId'], B: fields['b.lawyerId'] },
    messages: room.messages.map((raw) => JSON.parse(raw)), verdict };
  return {
    speech: speakableItems(publicInput),
    debateId: fields.debateId!, archivedAt: fields.archivedAt ? new Date(Number(fields.archivedAt)).toISOString() : null,
    rematch: { A: fields['a.rematch'] === '1', B: fields['b.rematch'] === '1' },
    summaries: PublicSummary.array().parse(summaries),
    summary: fields.phase === "summary" ? { ordinal: Number(fields.ordinal), current: summaries.find((s: { ordinal: number }) => s.ordinal === Number(fields.ordinal)) ?? null,
      showUntil: fields.showUntil ? new Date(Number(fields.showUntil)).toISOString() : null } : null,
    jury: fields.phase === "jury" ? { status: fields.juryStatus as "pending" | "retry_required", errorCode: (fields.juryError || null) as import("@quarrel/shared/contract").JuryFailureCode | null,
      retryAvailableAt: fields.juryRetryAvailableAt ? new Date(Number(fields.juryRetryAvailableAt)).toISOString() : null } : null,
    verdict: verdict ? JuryVerdict.parse(verdict) : null,
    roomId: room.roomId, code: fields.code!, version: Number(fields.version),
    createdAt: new Date(Number(fields.createdAt)).toISOString(),
    expiresAt: new Date(Number(fields.expiresAt)).toISOString(),
    serverNow: new Date(now).toISOString(), closed: fields.closed === "1", you, players,
    bothReady: players.length === 2 && players.every((player) => !player.left && player.ready && player.connected),
    plan: fields.plan ? DebatePlan.parse(JSON.parse(fields.plan)) : null,
    startsAt: fields.startsAt ? new Date(Number(fields.startsAt)).toISOString() : null,
    debate: ["debate", "summary", "jury", "complete", "ended"].includes(fields.phase!) ? {
      ordinal: Number(fields.ordinal), activeSlot, clocks,
      state: fields.phase === "ended" ? "ended" : state === "consulting" && fields.workOwner !== you.slot ? "lawyering" : state as NonNullable<RoomSnapshot["debate"]>["state"],
      deadline: composing && fields.deadline ? new Date(Number(fields.deadline)).toISOString() : null,
      yourArgumentsThisSubtopic: Number(fields[`${you.slot.toLowerCase()}.arguments`]),
      consultsLeft: Math.max(0, 2 - Number(fields[`${you.slot.toLowerCase()}.consults`] ?? 0)),
      drafts: JSON.parse(fields[`${you.slot.toLowerCase()}.drafts`] ?? "[]").map((entry: { at: number }) => ({ ...entry, at: new Date(entry.at).toISOString() })),
      consultations: JSON.parse(fields[`${you.slot.toLowerCase()}.consultations`] ?? "[]").map((entry: { at: number }) => ({ ...entry, at: new Date(entry.at).toISOString() })),
    } : null,
    messages: room.messages.map((raw) => {
      const message = JSON.parse(raw);
      return { id: message.id, ...(message.label ? { label: message.label } : {}), ordinal: message.ordinal, kind: message.kind, slot: message.slot,
        ...(message.source || message.kind === "argument" ? { source: message.source ?? "fallback" } : {}),
        text: message.text, at: new Date(message.at).toISOString() };
    }),
    setup: {
      phase: fields.phase as RoomSnapshot["setup"]["phase"],
      theme: fields.theme as RoomSnapshot["setup"]["theme"], topic: fields.topic!,
      durationSec: Number(fields.durationSec) as RoomSnapshot["setup"]["durationSec"],
      positions: { A: fields["a.position"] || null, B: fields["b.position"] || null },
    },
  };
}
