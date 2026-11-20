import { createHash, randomUUID } from "node:crypto";
import type { ErrorCode } from "@quarrel/shared/contract";
import type { TtsConfig } from "../common/config";
import { AppError } from "../api/errors";
import { generateSpeech, SpeechError } from "../worker/ai/speech-provider";
import { SpeechRepo } from "./speech-repo";

export class SpeechFailure extends AppError {
  constructor(code: ErrorCode, readonly fallbackAllowed: boolean) { super(code); }
}
interface Options { wait?: (ms: number) => Promise<void>; now?: () => number }
export class SpeechService {
  constructor(private readonly repo: SpeechRepo, private readonly config: TtsConfig, private readonly generate = generateSpeech, private readonly options: Options = {}) {}
  async speak(playerId: string, roomId: string, speechId: string): Promise<Buffer> {
    const item = (await this.repo.items(playerId,roomId)).find((s) => s.speechId === speechId);
    if (!item) throw new SpeechFailure("SPEECH_NOT_FOUND",false);
    if (item.speechBlocked) throw new SpeechFailure("SPEECH_BLOCKED",false);
    if ([...item.text].length>4000) throw new SpeechFailure("SPEECH_INVALID_TEXT",false);
    if (this.config.JUDGE_AI_MODE === "demo" || !this.config.GEMINI_TTS_API_KEY) throw new SpeechFailure("SPEECH_UNAVAILABLE",true);
    const hash = createHash("sha256").update(JSON.stringify([item.voice.geminiVoice,item.text])).digest("hex");
    const hit = await this.repo.cache(hash); if (hit) return Buffer.from(hit.toString(),"base64");
    const token = randomUUID();
    const reservation = await this.repo.reserve(hash,playerId,token,this.config.TTS_TIMEOUT_MS+3000);
    if (reservation === "HIT" || reservation === "WAIT") {
      const now = this.options.now ?? Date.now;
      const until = now() + this.config.TTS_TIMEOUT_MS + 1000;
      const wait = this.options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      while (true) {
        const cached = await this.repo.cache(hash); if (cached) return Buffer.from(cached.toString(),"base64");
        if (!(await this.repo.locked(hash))) {
          // Release atomically saves audio and removes the lock; it may race our first read.
          const finished = await this.repo.cache(hash);
          if (finished) return Buffer.from(finished.toString(), "base64");
          break;
        }
        const remaining = until - now();
        if (remaining <= 0) break;
        await wait(Math.min(200, remaining));
      }
      throw new SpeechFailure("SPEECH_BUSY",true);
    }
    if (reservation !== "OWN") throw new SpeechFailure(reservation === "RATE" ? "SPEECH_RATE_LIMITED" : "SPEECH_BUSY",true);
    let audio: Uint8Array | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    try {
      audio = await Promise.race([this.generate({text:item.text,voice:item.voice.geminiVoice},this.config),
        new Promise<never>((_,reject) => { timer=setTimeout(() => reject(new SpeechFailure("SPEECH_TIMEOUT",true)),this.config.TTS_TIMEOUT_MS); })]);
      return Buffer.from(audio);
    } catch (error) {
      if (error instanceof SpeechFailure) throw error;
      const code = error instanceof SpeechError ? error.code : "";
      const mapped = code === "TTS_CONTENT_BLOCKED" ? "SPEECH_BLOCKED" : code === "TTS_TIMEOUT" ? "SPEECH_TIMEOUT" : code === "TTS_QUOTA" ? "SPEECH_RATE_LIMITED" : "SPEECH_PROVIDER_ERROR";
      throw new SpeechFailure(mapped,mapped !== "SPEECH_BLOCKED");
    } finally {
      clearTimeout(timer);
      await this.repo.release(hash,token,audio && audio.length <= this.config.TTS_CACHE_MAX_BYTES ? audio : undefined);
    }
  }
}
