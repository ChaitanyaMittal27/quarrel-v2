import type { RoomSnapshot, PlayerView } from "@quarrel/shared/contract";
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
  return {
    roomId: room.roomId, code: fields.code!, version: Number(fields.version),
    createdAt: new Date(Number(fields.createdAt)).toISOString(),
    expiresAt: new Date(Number(fields.expiresAt)).toISOString(),
    serverNow: new Date(now).toISOString(), closed: fields.closed === "1", you, players,
    bothReady: players.length === 2 && players.every((player) => !player.left && player.ready && player.connected),
  };
}
