import type { JuryFailureCode, RoomSnapshot } from '@quarrel/shared/contract'

export const juryReasons: Record<JuryFailureCode, string> = {
  rate_limited: 'The jury provider is busy.', quota_exhausted: 'The jury provider has no quota available.',
  provider_unavailable: 'The jury provider is unavailable.', timeout: 'The jury took too long to answer.',
  invalid_response: 'The jury could not produce a valid judgment.', missing_configuration: 'The jury provider is not configured.',
  demo_mode: 'The jury is in demo mode.', unsafe_dispute: 'This dispute needs a safer discussion.',
}
export function retrySeconds(room: RoomSnapshot, receivedAt: number, now: number): number {
  return Math.max(0, Math.ceil(((Date.parse(room.jury?.retryAvailableAt ?? '') || 0) - Date.parse(room.serverNow) - Math.max(0, now - receivedAt)) / 1000))
}
export function resetLabel(status: import('@quarrel/shared/contract').AiStatus) { return status.resetsAt ? new Date(status.resetsAt).toLocaleString() : 'the daily reset' }
