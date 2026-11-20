import type { Redis } from "ioredis";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { ErrorCode, DebatePlan, JuryVerdict, JuryFailureCode, type CreateRoomRequest, type SubmitMessageRequest, type SetChoicesRequest } from "@quarrel/shared/contract";
import { playerCharacters, lawyers } from "@quarrel/shared/config";
import { loadLua } from "../common/lua";

const clockPrelude = new URL("./lua/clock-common.lua", import.meta.url);
const scripts = {
  rematch: loadLua(new URL("./lua/rematch.lua", import.meta.url)),
  archive: loadLua(new URL("./lua/archive.lua", import.meta.url)),
  create: loadLua(new URL("./lua/create.lua", import.meta.url)),
  join: loadLua(new URL("./lua/join.lua", import.meta.url)),
  leave: loadLua(new URL("./lua/leave.lua", import.meta.url)),
  ready: loadLua(new URL("./lua/set-ready.lua", import.meta.url)),
  position: loadLua(new URL("./lua/position.lua", import.meta.url)),
  choices: loadLua(new URL("./lua/choices.lua", import.meta.url)),
  savePlan: loadLua(new URL("./lua/save-plan.lua", import.meta.url)),
  start: loadLua(new URL("./lua/start.lua", import.meta.url), clockPrelude),
  due: loadLua(new URL("./lua/due.lua", import.meta.url)),
  read: loadLua(new URL("./lua/read.lua", import.meta.url), clockPrelude),
  catchup: loadLua(new URL("./lua/catchup.lua", import.meta.url), clockPrelude),
  submit: loadLua(new URL("./lua/submit.lua", import.meta.url), clockPrelude),
  finishLawyer: loadLua(new URL("./lua/finish-lawyer.lua", import.meta.url), clockPrelude),
  finishSummary: loadLua(new URL("./lua/finish-summary.lua", import.meta.url), clockPrelude),
  judgeInput: loadLua(new URL("./lua/judge-input.lua", import.meta.url)),
  finishJury: loadLua(new URL("./lua/finish-jury.lua", import.meta.url)),
  retryJury: loadLua(new URL("./lua/retry-jury.lua", import.meta.url)),
  lawyerInput: loadLua(new URL("./lua/lawyer-input.lua", import.meta.url)),
};

const Result = z.object({
  status: z.enum(["OK", "RETRY", "CODE_TAKEN", ...ErrorCode.options]),
  roomId: z.string().optional(),
  changed: z.boolean().optional(),
  archiveId: z.string().optional(),
  debateId: z.string().optional(),
  planningStarted: z.boolean().optional(),
  workId: z.string().optional(),
  judge: z.object({ kind: z.enum(["summary", "jury"]), index: z.int(), debateId: z.string().optional(), workId: z.string().optional() }).optional(),
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
const allowedCharacters = JSON.stringify(playerCharacters.map((entry) => entry.id));
const allowedLawyers = JSON.stringify(lawyers.map((entry) => entry.id));

export interface RoomRepoOptions {
  workTimeoutMs?: number;
  summaryTimeoutMs?: number;
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
        [current, roomId, code, playerId, setup.name, String(this.lifetimeMs), setup.theme, setup.topic, String(setup.durationSec), `d_${randomBytes(16).toString("base64url")}`]));
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

  async setChoices(playerId: string, roomId: string, choices: SetChoicesRequest): Promise<RoomResult> {
    return parse(await scripts.choices(this.redis, [playerKey(playerId), roomKey(roomId)],
      [roomId, playerId, choices.characterId ?? "", choices.lawyerId ?? "", allowedCharacters, allowedLawyers]));
  }

  async savePlan(roomId: string, plan: DebatePlan, debateId = ""): Promise<RoomResult> {
    return parse(await scripts.savePlan(this.redis, [roomKey(roomId)], [JSON.stringify(DebatePlan.parse(plan)), debateId]));
  }

  async start(playerId: string, roomId: string): Promise<RoomResult> {
    return this.retry(async () => {
      const fields = await this.readRoom(roomId);
      const a = fields["a.player"] ?? "", b = fields["b.player"] ?? "";
      return parse(await scripts.start(this.redis,
        [playerKey(playerId), roomKey(roomId), presenceKey(a), presenceKey(b), `${roomKey(roomId)}:messages`, this.deadlinesKey],
        [roomId, playerId, a, b, this.testNow(), ...this.summaryArgs()]));
    });
  }

  async catchup(roomId: string): Promise<RoomResult> {
    return parse(await scripts.catchup(this.redis, [roomKey(roomId), `${roomKey(roomId)}:messages`, this.deadlinesKey],
      [this.testNow(), ...this.summaryArgs()]));
  }

  async submit(playerId: string, roomId: string, body: SubmitMessageRequest): Promise<RoomResult> {
    const hash = createHash("sha256").update(JSON.stringify([body.kind, body.ordinal, body.text])).digest("hex");
    return parse(await scripts.submit(this.redis,
      [playerKey(playerId), roomKey(roomId), `${roomKey(roomId)}:messages`, `${roomKey(roomId)}:requests`, this.deadlinesKey],
      [roomId, playerId, String(body.ordinal), body.text, body.requestKey, hash, this.testNow(), body.kind, String(this.options.workTimeoutMs ?? 30000), `w_${randomBytes(16).toString("base64url")}`, ...this.summaryArgs()]));
  }

  async finishLawyer(roomId: string, workId: string, text: string, source: "ai" | "demo" | "fallback"): Promise<RoomResult> {
    return parse(await scripts.finishLawyer(this.redis, [roomKey(roomId), `${roomKey(roomId)}:messages`, this.deadlinesKey],
      [workId, text, source, this.testNow(), ...this.summaryArgs()]));
  }
  async lawyerInput(roomId: string, workId: string): Promise<{ fields: Record<string, string>; messages: string[] } | null> {
    const result = parse(await scripts.lawyerInput(this.redis, [roomKey(roomId), `${roomKey(roomId)}:messages`], [workId, this.testNow()]));
    if (!result.fields) return null;
    const fields: Record<string, string> = {};
    for (let index = 0; index < result.fields.length; index += 2) fields[result.fields[index]!] = result.fields[index + 1]!;
    return { fields, messages: result.messages ?? [] };
  }

  private summaryArgs(): string[] { return [String(this.options.summaryTimeoutMs ?? 30000), `w_${randomBytes(16).toString("base64url")}`]; }

  async judgeInput(roomId: string, judge: NonNullable<RoomResult["judge"]>, claim: string) {
    const result = parse(await scripts.judgeInput(this.redis, [roomKey(roomId), `${roomKey(roomId)}:messages`],
      [judge.kind, String(judge.index), judge.workId ?? "", claim, this.testNow(), judge.debateId ?? ""]));
    const fields: Record<string, string> = {};
    for (let i = 0; i < (result.fields?.length ?? 0); i += 2) fields[result.fields![i]!] = result.fields![i + 1]!;
    return { ...result, fields: result.fields ? fields : null, messages: result.messages ?? [] };
  }

  async finishSummary(roomId: string, workId: string, claim: string, text: string, source: "ai" | "demo" | "fallback") {
    return parse(await scripts.finishSummary(this.redis, [roomKey(roomId), `${roomKey(roomId)}:messages`, this.deadlinesKey],
      [workId, claim, text, source, this.testNow(), ...this.summaryArgs()]));
  }

  async finishJury(roomId: string, round: number, claim: string, verdict: JuryVerdict | null, failure: JuryFailureCode = "provider_unavailable", terminal = false) {
    const id = (await this.readRoom(roomId)).debateId ?? "";
    return parse(await scripts.finishJury(this.redis, [roomKey(roomId), this.deadlinesKey, "pending-archives", `archive:${id}`, `${roomKey(roomId)}:messages`],
      [String(round), claim, verdict ? JSON.stringify(JuryVerdict.parse(verdict)) : "", "", JuryFailureCode.parse(failure), terminal ? "1" : "0", this.testNow()]));
  }

  async retryJury(playerId: string, roomId: string) {
    return parse(await scripts.retryJury(this.redis, [playerKey(playerId), roomKey(roomId)], [roomId, playerId, this.testNow()]));
  }

  async rematch(playerId: string, roomId: string, debateId: string) {
    return parse(await scripts.rematch(this.redis, [playerKey(playerId), roomKey(roomId), `${roomKey(roomId)}:messages`, `${roomKey(roomId)}:requests`, this.deadlinesKey],
      [roomId, playerId, debateId, `d_${randomBytes(16).toString("base64url")}`, this.testNow()]));
  }
  async archiveInput(roomId: string, debateId: string) {
    const result = parse(await scripts.archive(this.redis, [roomKey(roomId), `${roomKey(roomId)}:messages`, "pending-archives", `archive:${debateId}`], [debateId, "", this.testNow()]));
    if (!result.fields) return null;
    const fields: Record<string, string> = {};
    for (let i = 0; i < result.fields.length; i += 2) fields[result.fields[i]!] = result.fields[i + 1]!;
    return { fields, messages: result.messages ?? [], now: result.now! };
  }
  async markArchived(roomId: string, debateId: string) {
    return parse(await scripts.archive(this.redis, [roomKey(roomId), `${roomKey(roomId)}:messages`, "pending-archives", `archive:${debateId}`], [debateId, "save", this.testNow()]));
  }
  async pendingArchive(playerId: string, debateId: string): Promise<boolean> {
    const roomId = await this.redis.hget("pending-archives", debateId) ?? await this.redis.get(playerKey(playerId));
    if (!roomId) return false;
    const frozen = await this.archiveInput(roomId, debateId);
    if (frozen) return [frozen.fields['a.player'], frozen.fields['b.player']].includes(playerId);
    const [currentId, a, b] = await this.redis.hmget(roomKey(roomId), "debateId", "a.player", "b.player");
    return currentId === debateId && [a,b].includes(playerId);
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
        [current, a, b, playerId, this.testNow(), ...this.summaryArgs()]));
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
