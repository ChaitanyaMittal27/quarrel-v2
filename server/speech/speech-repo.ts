import type { Redis } from "ioredis";
import { loadLua } from "../common/lua";
import { AppError } from "../api/errors";
import { ErrorCode } from "@quarrel/shared/contract";
import { speakableItems } from "@quarrel/shared/speech";

const read = loadLua(new URL("./lua/read.lua", import.meta.url));
const reserve = loadLua(new URL("./lua/reserve.lua", import.meta.url));
const release = loadLua(new URL("./lua/release.lua", import.meta.url));
export class SpeechRepo {
  constructor(private readonly redis: Redis, private readonly prefix = "tts") {}
  async items(playerId: string, roomId: string) {
    const result = JSON.parse(await read(this.redis,[`player:${playerId}`,`room:${roomId}`,`room:${roomId}:messages`],[roomId,playerId]));
    if (result.status !== "OK") throw new AppError(ErrorCode.parse(result.status));
    const fields: Record<string,string> = {};
    for (let i=0;i<result.fields.length;i+=2) fields[result.fields[i]] = result.fields[i+1];
    return speakableItems({ debateId:fields.debateId!, theme:fields.theme!, lawyers:{A:fields['a.lawyerId'],B:fields['b.lawyerId']},
      messages:(result.messages ?? []).map((raw: string) => JSON.parse(raw)), verdict:fields.verdict ? JSON.parse(fields.verdict) : null });
  }
  cache(hash: string) { return this.redis.getBuffer(`${this.prefix}:audio:${hash}`); }
  async locked(hash: string) { return (await this.redis.exists(`${this.prefix}:lock:${hash}`)) === 1; }
  async reserve(hash: string, playerId: string, token: string, lease: number): Promise<string> {
    return reserve(this.redis,[`${this.prefix}:lock:${hash}`,`${this.prefix}:inflight`,`${this.prefix}:rate:${playerId}`,`${this.prefix}:audio:${hash}`],[token,String(lease)]);
  }
  async release(hash: string, token: string, audio?: Uint8Array): Promise<void> {
    // Lua helper accepts strings; binary WAV is base64 in Redis, decoded on a cache read.
    await release(this.redis,[`${this.prefix}:lock:${hash}`,`${this.prefix}:inflight`,`${this.prefix}:audio:${hash}`],
      [token,audio ? Buffer.from(audio).toString("base64") : "",String(15*60*1000)]);
  }
}
