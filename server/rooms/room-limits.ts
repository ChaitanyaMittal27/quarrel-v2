import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { loadLua } from '../common/lua';
import { AppError } from '../api/errors';

const count = loadLua(new URL('./lua/room-limit.lua', import.meta.url));
export interface RoomLimitOptions { create?: number; join?: number; prefix?: string }
export class RoomLimits {
  constructor(private readonly redis: Redis, private readonly options: RoomLimitOptions = {}) {}
  async check(ip: string, action: 'create' | 'join') {
    const hash = createHash('sha256').update(ip).digest('hex');
    const retry = Number(await count(this.redis, [`${this.options.prefix ?? 'limits:rooms'}:${action}:${hash}`], [String(this.options[action] ?? (action === 'create' ? 10 : 30))]));
    if (retry) throw new AppError('ROOM_RATE_LIMITED', undefined, retry);
  }
}
