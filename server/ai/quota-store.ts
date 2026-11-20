import type { Redis } from 'ioredis';
import { availableAi, type AiStatus } from '@quarrel/shared/contract';

export interface QuotaConfig {
  JUDGE_AI_MODE: 'auto' | 'demo'; GEMINI_MODEL?: string; GEMINI_FALLBACK_MODEL?: string; GEMINI_TTS_MODEL?: string;
  AI_QUOTA_RESET_TZ?: string; AI_QUOTA_E2E?: boolean;
}
/** First change of local calendar day, including 23/25-hour DST days; no host timezone dependency. */
export function nextQuotaReset(now: number, timeZone = 'America/Los_Angeles'): number {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const day = format.format(now);
  let low = now, high = now + 36 * 3600000;
  while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (format.format(mid) === day) low = mid; else high = mid; }
  return high;
}

export class QuotaStore {
  constructor(private readonly redis: Redis, readonly config: QuotaConfig, private readonly prefix = 'ai:exhausted') {}
  key(model: string) { return `${this.prefix}:${model}`; }
  async until(model?: string): Promise<number | null> {
    if (!model || this.config.JUDGE_AI_MODE === 'demo' && !this.config.AI_QUOTA_E2E) return null;
    const raw = await this.redis.get(this.key(model));
    return raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
  }
  async mark(model: string) {
    if (this.config.JUDGE_AI_MODE === 'demo') return;
    const [seconds, micros] = await this.redis.time();
    const reset = nextQuotaReset(Number(seconds) * 1000 + Math.floor(Number(micros) / 1000), this.config.AI_QUOTA_RESET_TZ);
    await this.redis.set(this.key(model), String(reset), 'PXAT', reset);
  }
  async status(): Promise<AiStatus> {
    const [primary, fallback, voice] = await Promise.all([this.until(this.config.GEMINI_MODEL), this.until(this.config.GEMINI_FALLBACK_MODEL), this.until(this.config.GEMINI_TTS_MODEL)]);
    const text = primary ? this.config.GEMINI_FALLBACK_MODEL && !fallback ? 'fallback' : 'exhausted' : 'ok';
    const resets = [text === 'exhausted' ? primary : null, text === 'exhausted' ? fallback : null, voice].filter((n): n is number => n !== null);
    return { ...availableAi, text, voice: voice ? 'off' : 'ok', resetsAt: resets.length ? new Date(Math.max(...resets)).toISOString() : null };
  }
}
