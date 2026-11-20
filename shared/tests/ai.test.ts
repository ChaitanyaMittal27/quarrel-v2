import { expect, it } from 'vitest';
import { AiStatus, availableAi, ErrorResponse } from '../contract';

it('public AI status is strict and supports fallback/exhausted/off with a reset timestamp', () => {
  expect(AiStatus.parse(availableAi)).toEqual(availableAi);
  for (const text of ['ok','fallback','exhausted']) expect(AiStatus.safeParse({text,voice:'off',resetsAt:'2026-11-21T08:00:00.000Z'}).success).toBe(true);
  for (const changed of [{text:'bad'},{voice:'bad'},{resetsAt:'bad'},{modelKey:'private'}]) expect(AiStatus.safeParse({...availableAi,...changed}).success).toBe(false);
});
it('room rate responses expose only a positive retry delay', () => {
  const body={error:{code:'ROOM_RATE_LIMITED',message:'Please wait.'},retryAfterSeconds:60};
  expect(ErrorResponse.parse(body)).toEqual(body);
  expect(ErrorResponse.safeParse({...body,retryAfterSeconds:0}).success).toBe(false);
});
