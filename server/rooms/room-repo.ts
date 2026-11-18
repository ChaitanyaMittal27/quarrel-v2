import type { Redis } from "ioredis";
import { z } from "zod";
import { ErrorCode } from "@quarrel/shared/contract";
import { loadLua } from "../common/lua";

const scripts = {
  create: loadLua(new URL("./lua/create.lua", import.meta.url)),
  join: loadLua(new URL("./lua/join.lua", import.meta.url)),
  leave: loadLua(new URL("./lua/leave.lua", import.meta.url)),
  ready: loadLua(new URL("./lua/set-ready.lua", import.meta.url)),
  read: loadLua(new URL("./lua/read.lua", import.meta.url)),
};

const Result = z.object({
  status: z.enum(["OK", "RETRY", "CODE_TAKEN", ...ErrorCode.options]),
  roomId: z.string().optional(),
  changed: z.boolean().optional(),
  fields: z.array(z.string()).optional(),
  now: z.number().optional(),
  presence: z.tuple([z.boolean(), z.boolean()]).optional(),
});
export type RoomResult = z.infer<typeof Result>;
export interface RoomRead {
  roomId: string;
  fields: Record<string, string>;
  now: number;
  presence: [boolean, boolean];
}

const roomKey = (id: string) => `room:${id}`;
const playerKey = (id: string) => `player:${id}`;
const codeKey = (code: string) => `code:${code}`;
const presenceKey = (id: string) => `presence:${id}`;
const parse = (raw: string): RoomResult => Result.parse(JSON.parse(raw));

export interface RoomRepoOptions {
  /** Production: 24 hours. Negative test values create retained, already-expired rooms. */
  lifetimeMs?: number;
}

export class RoomRepo {
  readonly lifetimeMs: number;

  constructor(private readonly redis: Redis, options: RoomRepoOptions = {}) {
    this.lifetimeMs = options.lifetimeMs ?? 86_400_000;
    if (!Number.isSafeInteger(this.lifetimeMs) || this.lifetimeMs <= -86_400_000) {
      throw new Error("Room lifetime must be an integer greater than -24 hours");
    }
  }

  async create(playerId: string, name: string, roomId: string, code: string): Promise<RoomResult> {
    return this.retry(async () => {
      const current = await this.redis.get(playerKey(playerId)) ?? "";
      return parse(await scripts.create(this.redis,
        [playerKey(playerId), roomKey(roomId), codeKey(code), roomKey(current)],
        [current, roomId, code, playerId, name, String(this.lifetimeMs)]));
    });
  }

  async join(playerId: string, code: string, name: string): Promise<RoomResult> {
    return this.retry(async () => {
      const [current, target] = await Promise.all([
        this.redis.get(playerKey(playerId)), this.redis.get(codeKey(code)),
      ]);
      return parse(await scripts.join(this.redis,
        [playerKey(playerId), codeKey(code), roomKey(target ?? ""), roomKey(current ?? "")],
        [current ?? "", target ?? "", playerId, name]));
    });
  }

  async leave(playerId: string, roomId: string): Promise<RoomResult> {
    return parse(await scripts.leave(this.redis, [playerKey(playerId), roomKey(roomId)], [roomId, playerId]));
  }

  async setReady(playerId: string, roomId: string, ready: boolean): Promise<RoomResult> {
    return parse(await scripts.ready(this.redis,
      [playerKey(playerId), roomKey(roomId)], [roomId, playerId, ready ? "1" : "0"]));
  }

  /** Membership, fields, presence and clock are read together, after checking discovered keys. */
  async read(playerId: string): Promise<RoomResult> {
    return this.retry(async () => {
      const current = await this.redis.get(playerKey(playerId)) ?? "";
      const fields = current ? await this.redis.hgetall(roomKey(current)) : {};
      const a = fields["a.player"] ?? "";
      const b = fields["b.player"] ?? "";
      return parse(await scripts.read(this.redis,
        [playerKey(playerId), roomKey(current), presenceKey(a), presenceKey(b)],
        [current, a, b, playerId]));
    });
  }

  async currentRoomId(playerId: string): Promise<string | null> {
    return this.redis.get(playerKey(playerId));
  }

  /** Only routing identities, never a public room snapshot. Departed seats are excluded. */
  async seatedPlayerIds(roomId: string): Promise<string[]> {
    const fields = await this.redis.hgetall(roomKey(roomId));
    return ["a", "b"].flatMap((seat) => {
      const id = fields[`${seat}.player`];
      return id && fields[`${seat}.left`] !== "1" ? [id] : [];
    });
  }

  async refreshPresence(playerId: string): Promise<void> {
    await this.redis.set(presenceKey(playerId), "1", "EX", 35);
  }

  async clearPresence(playerId: string): Promise<boolean> {
    return (await this.redis.del(presenceKey(playerId))) > 0;
  }

  private async retry(action: () => Promise<RoomResult>): Promise<RoomResult> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await action();
      if (result.status !== "RETRY") return result;
    }
    return { status: "SERVICE_UNAVAILABLE" };
  }
}

export function roomRead(result: RoomResult): RoomRead | null {
  if (!result.roomId) return null;
  if (!result.fields || result.now === undefined || !result.presence) throw new Error("Incomplete room read");
  const fields: Record<string, string> = {};
  for (let index = 0; index < result.fields.length; index += 2) {
    fields[result.fields[index]!] = result.fields[index + 1]!;
  }
  return { roomId: result.roomId, fields, now: result.now, presence: result.presence };
}
