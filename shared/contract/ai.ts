import { z } from 'zod';
import { IsoDateTime } from './common';

export const AiStatus = z.strictObject({
  text: z.enum(['ok', 'fallback', 'exhausted']), voice: z.enum(['ok', 'off']), resetsAt: IsoDateTime.nullable(),
});
export type AiStatus = z.infer<typeof AiStatus>;
export const availableAi: AiStatus = { text: 'ok', voice: 'ok', resetsAt: null };
