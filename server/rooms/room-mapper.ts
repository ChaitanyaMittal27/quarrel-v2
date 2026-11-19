import { DebatePlan, type RoomSnapshot, type PlayerView } from "@quarrel/shared/contract";
import type { RoomRead } from "./room-repo";

/** Rules 1.7, 1.12, 1.14, 1.17: explicitly allowlist public fields, retaining vacated seats. */
export function mapRoom(room: RoomRead, viewerId: string): RoomSnapshot {
  const { fields, now, presence } = room;
  const players: PlayerView[] = [];
  let you: RoomSnapshot["you"] | undefined;
  for (const [index, prefix] of ["a", "b"].entries()) {
    const playerId = fields[`${prefix}.player`];
    if (!playerId) continue;
    const slot = prefix === "a" ? "A" : "B";
    const left = fields[`${prefix}.left`] === "1";
    players.push({ slot, name: fields[`${prefix}.name`]!, ready: fields[`${prefix}.ready`] === "1",
      left, connected: Boolean(presence[index]) && !left });
    if (playerId === viewerId && !left) you = { slot };
  }
  if (!you) throw new Error("Snapshot viewer has no active seat");
  const clocks = { A: Number(fields["a.remainingMs"]), B: Number(fields["b.remainingMs"]) };
  const activeSlot = (fields.activeSlot || null) as "A" | "B" | null;
  if (activeSlot && fields.deadline) clocks[activeSlot] = Math.max(0, Math.min(clocks[activeSlot], Number(fields.deadline) - now));
  return {
    roomId: room.roomId, code: fields.code!, version: Number(fields.version),
    createdAt: new Date(Number(fields.createdAt)).toISOString(),
    expiresAt: new Date(Number(fields.expiresAt)).toISOString(),
    serverNow: new Date(now).toISOString(), closed: fields.closed === "1", you, players,
    bothReady: players.length === 2 && players.every((player) => !player.left && player.ready && player.connected),
    plan: fields.plan ? DebatePlan.parse(JSON.parse(fields.plan)) : null,
    startsAt: fields.startsAt ? new Date(Number(fields.startsAt)).toISOString() : null,
    debate: ["debate", "ended"].includes(fields.phase!) ? {
      ordinal: Number(fields.ordinal), activeSlot, clocks,
      deadline: fields.deadline ? new Date(Number(fields.deadline)).toISOString() : null,
      yourArgumentsThisSubtopic: Number(fields[`${you.slot.toLowerCase()}.arguments`]),
    } : null,
    messages: room.messages.map((raw) => {
      const message = JSON.parse(raw);
      return { id: message.id, ordinal: message.ordinal, kind: message.kind, slot: message.slot,
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
