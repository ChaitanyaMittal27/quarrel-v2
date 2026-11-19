import type { Redis } from "ioredis";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ErrorCode, DebatePlan, type CreateRoomRequest, type SubmitMessageRequest } from "@quarrel/shared/contract";
import { loadLua } from "../common/lua";

const clockPrelude = new URL("./lua/clock-common.lua", import.meta.url);
const scripts = {
  create: loadLua(new URL("./lua/create.lua", import.meta.url)),
  join: loadLua(new URL("./lua/join.lua", import.meta.url)),
  leave: loadLua(new URL("./lua/leave.lua", import.meta.url)),
  ready: loadLua(new URL("./lua/set-ready.lua", import.meta.url)),
  position: loadLua(new URL("./lua/position.lua", import.meta.url)),
  savePlan: loadLua(new URL("./lua/save-plan.lua", import.meta.url)),
  start: loadLua(new URL("./lua/start.lua", import.meta.url), clockPrelude),
  due: loadLua(new URL("./lua/due.lua", import.meta.url)),
  read: loadLua(new URL("./lua/read.lua", import.meta.url), clockPrelude),
  catchup: loadLua(new URL("./lua/catchup.lua", import.meta.url), clockPrelude),
  submit: loadLua(new URL("./lua/submit.lua", import.meta.url), clockPrelude),
};

const Result = z.object({
  status: z.enum(["OK", "RETRY", "CODE_TAKEN", ...ErrorCode.options]),
  roomId: z.string().optional(),
  changed: z.boolean().optional(),
  planningStarted: z.boolean().optional(),
  deadline: z.number().nullable().optional(),
  messages: z.array(z.string()).optional(),
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
  messages: string[];
}

const roomKey = (id: string) => `room:${id}`;
const playerKey = (id: string) => `player:${id}`;
const codeKey = (code: string) => `code:${code}`;
const presenceKey = (id: string) => `presence:${id}`;
const parse = (raw: string): RoomResult => Result.parse(JSON.parse(raw));

export interface RoomRepoOptions {
  /** Production: 24 hours. Negative test values create retained, already-expired rooms. */
  lifetimeMs?: number;
  /** Tests isolate their deadline set; production always uses deadlines. */
  deadlinesKey?: string;
  /** Test-only dependency injection; never populated by config or HTTP input. */
  now?: () => number;
}

export class RoomRepo {
  readonly lifetimeMs: number;

  constructor(private readonly redis: Redis, private readonly options: RoomRepoOptions = {}) {
    this.lifetimeMs = options.lifetimeMs ?? 86_400_000;
    if (!Number.isSafeInteger(this.lifetimeMs) || this.lifetimeMs <= -86_400_000) {
      throw new Error("Room lifetime must be an integer greater than -24 hours");
    }
  }

  async create(playerId: string, setup: CreateRoomRequest, roomId: string, code: string): Promise<RoomResult> {
    return this.retry(async () => {
      const current = await this.redis.get(playerKey(playerId)) ?? "";
      return parse(await scripts.create(this.redis,
        [playerKey(playerId), roomKey(roomId), codeKey(code), roomKey(current)],
        [current, roomId, code, playerId, setup.name, String(this.lifetimeMs), setup.theme, setup.topic, String(setup.durationSec)]));
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
    return parse(await scripts.leave(this.redis, [playerKey(playerId), roomKey(roomId), this.deadlinesKey], [roomId, playerId]));
  }

  async setReady(playerId: string, roomId: string, ready: boolean): Promise<RoomResult> {
    return parse(await scripts.ready(this.redis,
      [playerKey(playerId), roomKey(roomId)], [roomId, playerId, ready ? "1" : "0"]));
  }

  async setPosition(playerId: string, roomId: string, text: string): Promise<RoomResult> {
    return parse(await scripts.position(this.redis,
      [playerKey(playerId), roomKey(roomId)], [roomId, playerId, text]));
  }

  async readRoom(roomId: string): Promise<Record<string, string>> {
    return this.redis.hgetall(roomKey(roomId));
  }

  async savePlan(roomId: string, plan: DebatePlan): Promise<RoomResult> {
    return parse(await scripts.savePlan(this.redis, [roomKey(roomId)], [JSON.stringify(DebatePlan.parse(plan))]));
  }

  async start(playerId: string, roomId: string): Promise<RoomResult> {
    return this.retry(async () => {
      const fields = await this.readRoom(roomId);
      const a = fields["a.player"] ?? "", b = fields["b.player"] ?? "";
      return parse(await scripts.start(this.redis,
        [playerKey(playerId), roomKey(roomId), presenceKey(a), presenceKey(b), `${roomKey(roomId)}:messages`, this.deadlinesKey],
        [roomId, playerId, a, b, this.testNow()]));
    });
  }

  async catchup(roomId: string): Promise<RoomResult> {
    return parse(await scripts.catchup(this.redis, [roomKey(roomId), `${roomKey(roomId)}:messages`, this.deadlinesKey],
      [this.testNow()]));
  }

  async submit(playerId: string, roomId: string, body: SubmitMessageRequest): Promise<RoomResult> {
    const hash = createHash("sha256").update(JSON.stringify([body.ordinal, body.text])).digest("hex");
    return parse(await scripts.submit(this.redis,
      [playerKey(playerId), roomKey(roomId), `${roomKey(roomId)}:messages`, `${roomKey(roomId)}:requests`, this.deadlinesKey],
      [roomId, playerId, String(body.ordinal), body.text, body.requestKey, hash, this.testNow()]));
  }

  async due(limit = 100): Promise<string[]> {
    const raw = await scripts.due(this.redis, [this.deadlinesKey], [String(limit), this.testNow()]);
    return z.array(z.string()).parse(JSON.parse(raw));
  }

  private get deadlinesKey(): string { return this.options.deadlinesKey ?? "deadlines"; }

  private testNow(): string { return this.options.now ? String(this.options.now()) : ""; }

  /** Membership, fields, presence and clock are read together, after checking discovered keys. */
  async read(playerId: string): Promise<RoomResult> {
    return this.retry(async () => {
      const current = await this.redis.get(playerKey(playerId)) ?? "";
      const fields = current ? await this.redis.hgetall(roomKey(current)) : {};
      const a = fields["a.player"] ?? "";
      const b = fields["b.player"] ?? "";
      return parse(await scripts.read(this.redis,
        [playerKey(playerId), roomKey(current), presenceKey(a), presenceKey(b), `${roomKey(current)}:messages`, this.deadlinesKey],
        [current, a, b, playerId, this.testNow()]));
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
  return { roomId: result.roomId, fields, now: result.now, presence: result.presence, messages: result.messages ?? [] };
}
