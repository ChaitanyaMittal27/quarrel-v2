import { ErrorCode } from '@quarrel/shared/contract'
import { ApiError } from '../lib/api'

export const errorMessages = {
  ROOM_RATE_LIMITED: 'Too many room attempts. Please wait before trying again.',
  JURY_QUOTA_EXHAUSTED: "Today's free AI limit is reached. Retry after the reset.",
  SUMMARIES_NOT_READY: "The summaries are not ready yet.",
  JURY_NOT_READY: "The jury is still deliberating.",
  JURY_RETRY_COOLDOWN: "Please wait before retrying the jury.",
  RESULTS_NOT_FOUND: "That result is unavailable.",
  RESULTS_NOT_READY: "The result is still being saved. Please try again shortly.",
  STALE_DEBATE: "The room has moved to another debate. Wait for the updated view.",
  SPEECH_NOT_FOUND: "This saved speech is no longer available.",
  SPEECH_BLOCKED: "Speech is not available for this item.",
  SPEECH_INVALID_TEXT: "This item is too long or unsuitable for speech.",
  SPEECH_UNAVAILABLE: "Server voice is unavailable.",
  SPEECH_RATE_LIMITED: "Voice is busy. Try again in a minute.",
  SPEECH_BUSY: "Voice is busy. Please try again shortly.",
  SPEECH_TIMEOUT: "Voice took too long to respond.",
  SPEECH_PROVIDER_ERROR: "Server voice could not be generated.",
  LAWYER_BUSY: 'Your lawyer is still at work. Please wait.',
  INVALID_CHOICE: 'Choose an available character or lawyer.',
  REQUEST_CONFLICT: 'That message changed during retry. Edit it and send again.',
  DEBATE_COMPLETE: 'This debate has ended.',
  DEBATE_NOT_STARTED: 'Wait for the debate to start.',
  STALE_TURN: 'The subtopic changed. Review your argument and try again.',
  NOT_YOUR_TURN: 'Wait for your turn.',
  TURN_EXPIRED: 'Your turn has ended.',
  LIMIT_REACHED: 'You reached 12 arguments for this subtopic. Your clock keeps running.',
  INVALID_REQUEST: 'Check your entries and try again.',
  INVALID_NAME: 'Enter a name of 1-32 characters without control characters.',
  INVALID_CODE: 'Enter the six-character room code (A-Z without I/O, 2-9).',
  INVALID_TOPIC: 'Enter a question of 1-240 characters without control characters.',
  INVALID_POSITION: 'Write a position of 1-600 characters. Only tabs and newlines are allowed as controls.',
  WRONG_PHASE: 'The room has moved to another stage. Wait for the updated view.',
  POSITION_REQUIRED: 'Save your position before becoming ready.',
  FORBIDDEN: 'Only the host can start the debate.',
  PLAN_NOT_READY: 'The plan is still being prepared.',
  PLAYER_NOT_CONNECTED: 'Both players must be connected before starting.',
  UNAUTHENTICATED: 'Your session ended. Create or join a room again.',
  SESSION_EXPIRED: 'Your session expired. Join again.',
  NOT_FOUND: 'That page is unavailable. Please try again.',
  ROOM_NOT_FOUND: 'Check the room code and try again.',
  ROOM_EXPIRED: 'This room has expired. Ask for a new code.',
  STALE_ROOM: 'This room is no longer current. Reopen your current room.',
  ALREADY_IN_ROOM: 'Leave your current room before joining another.',
  ROOM_CLOSED: 'This room is closed. Ask for a new code.',
  ROOM_FULL: 'This room already has two players. Ask for a different code.',
  INTERNAL: 'Something went wrong. Please try again.',
  SERVICE_UNAVAILABLE: 'The server is unavailable. Please try again.',
} satisfies Record<ErrorCode, string>

export type FieldName = 'name' | 'topic' | 'code' | 'position' | 'argument' | 'consultation'
export interface FocusRequest { field: FieldName; attempt: number }
export function focusInvalidField(control: { focus: () => void } | null, field: FieldName, request?: FocusRequest) {
  if (request?.field === field) control?.focus()
}
export type ActionName = 'create' | 'join' | 'position' | 'ready' | 'start' | 'juryRetry' | 'rematch' | 'send' | 'consult' | 'settings' | 'leave'
export type FieldErrors = Partial<Record<FieldName, string>>
export type ButtonErrors = Partial<Record<ActionName, string>>
export interface Feedback { fields: FieldErrors; buttons: ButtonErrors; banner: string }
export const emptyFeedback = (): Feedback => ({ fields: {}, buttons: {}, banner: '' })
export class FormError extends ApiError {
  readonly fields: FieldErrors
  constructor(fields: FieldErrors) {
    super('INVALID_REQUEST', 'Check your entries and try again.')
    this.fields = fields
  }
}
export function errorCode(failure: unknown): ErrorCode | null {
  const parsed = ErrorCode.safeParse(failure instanceof ApiError ? failure.code : failure instanceof Error ? failure.message : null)
  return parsed.success ? parsed.data : null
}
export function humanError(failure: unknown): string {
  if (failure instanceof ApiError && failure.code === 'ROOM_RATE_LIMITED' && failure.retryAfterSeconds) return `Too many room attempts. Try again in ${Math.ceil(failure.retryAfterSeconds / 60)} minute(s).`;
  const code = errorCode(failure)
  return code ? errorMessages[code] : 'Something went wrong. Please try again.'
}
export function feedbackFor(failure: unknown, action?: ActionName): Feedback {
  const result = emptyFeedback()
  if (failure instanceof FormError) return { ...result, fields: failure.fields }
  const code = errorCode(failure), message = action === 'consult' && code === 'LIMIT_REACHED' ? 'You have used both consultations for this subtopic.' : humanError(failure)
  if (!code || ['UNAUTHENTICATED', 'SESSION_EXPIRED', 'INTERNAL', 'SERVICE_UNAVAILABLE', 'NOT_FOUND'].includes(code)) return { ...result, banner: message }
  let field: FieldName | undefined
  if (code === 'INVALID_NAME') field = 'name'
  if (code === 'INVALID_TOPIC') field = 'topic'
  if (code === 'INVALID_CODE' || (action === 'join' && ['ROOM_NOT_FOUND', 'ROOM_FULL', 'ROOM_EXPIRED', 'ROOM_CLOSED', 'ALREADY_IN_ROOM'].includes(code))) field = 'code'
  if (code === 'INVALID_POSITION' || code === 'POSITION_REQUIRED') field = 'position'
  if (action === 'send' && ['INVALID_REQUEST', 'REQUEST_CONFLICT'].includes(code)) field = 'argument'
  if (action === 'consult' && ['INVALID_REQUEST', 'REQUEST_CONFLICT'].includes(code)) field = 'consultation'
  if (field) result.fields[field] = message
  else if (action) result.buttons[action] = message
  else result.banner = message
  return result
}
export function firstInvalidField(fields: FieldErrors): FieldName | undefined {
  return (['name', 'topic', 'code', 'position', 'argument', 'consultation'] as const).find((field) => fields[field])
}
export function clearField(feedback: Feedback, field: FieldName): Feedback {
  const fields = { ...feedback.fields }
  delete fields[field]
  const buttons = { ...feedback.buttons }
  const affected: Record<FieldName, ActionName[]> = { name: ['create', 'join'], topic: ['create'], code: ['join'], position: ['position', 'ready'], argument: ['send'], consultation: ['consult'] }
  for (const action of affected[field]) delete buttons[action]
  return { ...feedback, fields, buttons }
}

/** Structural schema type keeps the UI on shared Zod schemas without another dependency. */
export function parseForm<T>(schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: readonly { path: readonly PropertyKey[] }[] } } }, input: unknown, textField?: 'position' | 'argument' | 'consultation'): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const fields: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] === 'text' || issue.path.length === 0 ? textField : issue.path[0]
    if (key === 'name') fields.name = errorMessages.INVALID_NAME
    if (key === 'topic') fields.topic = errorMessages.INVALID_TOPIC
    if (key === 'code') fields.code = errorMessages.INVALID_CODE
    if (key === 'position') fields.position = errorMessages.INVALID_POSITION
    if (key === 'argument') fields.argument = 'Write an argument of 1-600 characters. Only tabs and newlines are allowed as controls.'
    if (key === 'consultation') fields.consultation = 'Write a question of 1-600 characters. Only tabs and newlines are allowed as controls.'
  }
  if (Object.keys(fields).length) throw new FormError(fields)
  throw new ApiError('INVALID_REQUEST', errorMessages.INVALID_REQUEST)
}
