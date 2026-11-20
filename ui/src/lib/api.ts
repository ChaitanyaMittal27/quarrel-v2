import { AiStatus, ErrorResponse, HealthResponse, RoomResponse, LeaveRoomResponse, ResultResponse, ResultsResponse, SpeechErrorResponse, type Theme, type DurationSec, type SetChoicesRequest } from '@quarrel/shared/contract'

// The only place the UI talks to the backend (see CLAUDE.md).

// Session refresh. The access cookie's token expires after 15 minutes; the server then answers
// SESSION_EXPIRED and the client swaps its refresh token for a new pair. Only one refresh may be
// in flight per page: every caller that hits SESSION_EXPIRED meanwhile waits for the same one.
// (Tabs racing each other are handled by the server's 10 s grace window.)
let refreshing: Promise<Response> | null = null

function refreshSession(): Promise<Response> {
  refreshing ??= fetch('/api/session/refresh', { method: 'POST' }).finally(() => {
    refreshing = null
  })
  return refreshing
}

export class ApiError extends Error {
  readonly code: string
  readonly retryAfterSeconds?: number
  constructor(code: string, message: string, retryAfterSeconds?: number) { super(message); this.code = code; this.retryAfterSeconds = retryAfterSeconds }
}
export class SpeechAudioError extends ApiError {
  readonly fallbackAllowed: boolean
  constructor(code: string, fallbackAllowed: boolean) { super(code, 'Speech could not play.'); this.fallbackAllowed=fallbackAllowed }
}
export async function requestSpeech(roomId: string, speechId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetchWithSession(`/api/rooms/${encodeURIComponent(roomId)}/speech`, { method:'POST', signal,
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({speechId}) })
  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null)
    const parsed = SpeechErrorResponse.safeParse(value)
    if (parsed.success) throw new SpeechAudioError(parsed.data.error.code,parsed.data.fallbackAllowed)
    const ordinary = ErrorResponse.safeParse(value)
    throw new SpeechAudioError(ordinary.success ? ordinary.data.error.code : 'INTERNAL',false)
  }
  const blob = await response.blob()
  if (!response.headers.get('content-type')?.startsWith('audio/') || !blob.size) throw new SpeechAudioError('SPEECH_PROVIDER_ERROR',false)
  return blob
}

async function failure(response: Response): Promise<never> {
  const parsed = ErrorResponse.safeParse(await response.json().catch(() => null))
  throw parsed.success ? new ApiError(parsed.data.error.code, parsed.data.error.message, parsed.data.retryAfterSeconds)
    : new ApiError('INVALID_RESPONSE', `The API returned HTTP ${response.status}.`)
}

/** Shared by HTTP retry and socket reconnect; only one refresh can be in flight. */
export async function refreshAccess(): Promise<void> {
  const response = (await refreshSession()).clone()
  if (response.status !== 204) await failure(response)
}

async function roomRequest(path: string, method = 'GET', body?: unknown): Promise<RoomResponse> {
  const response = await fetchWithSession(path, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) return failure(response)
  return RoomResponse.parse(await response.json())
}

export async function getAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  const response = await fetch('/api/ai/status', { signal, cache: 'no-store' })
  if (!response.ok) return failure(response)
  return AiStatus.parse(await response.json())
}

export const getSession = () => roomRequest('/api/session')
async function resultsRequest(path: string, method = 'GET') {
  const response = await fetchWithSession(path, { method })
  if (!response.ok) return failure(response)
  return response.json()
}
export const getResults = async (roomId?: string) => ResultsResponse.parse(await resultsRequest(`/api/results${roomId ? `?roomId=${encodeURIComponent(roomId)}` : ''}`))
export const getResult = async (debateId: string) => ResultResponse.parse(await resultsRequest(`/api/results/${encodeURIComponent(debateId)}`))
export const acknowledgeResult = async (debateId: string) => ResultResponse.parse(await resultsRequest(`/api/results/${encodeURIComponent(debateId)}/ack`, 'POST'))
export const requestRematch = (roomId: string, debateId: string) => roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/rematch`, 'POST', { debateId })
export const createRoom = (name: string, topic: string, theme: Theme = 'courtroom', durationSec: DurationSec = 240) =>
  roomRequest('/api/rooms', 'POST', { name, topic, theme, durationSec })
export const joinRoom = (name: string, code: string) => roomRequest('/api/rooms/join', 'POST', { name, code })
export const setReady = (roomId: string, ready: boolean) => roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/ready`, 'PUT', { ready })
export const setPosition = (roomId: string, text: string) => roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/position`, 'PUT', { text })
export const setChoices = (roomId: string, choices: SetChoicesRequest) => roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/choices`, 'POST', choices)
export const retryJury = (roomId: string) => roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/jury/retry`, 'POST')
export const startDebate = (roomId: string) => roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/start`, 'POST')
export const submitMessage = (roomId: string, ordinal: number, text: string, requestKey: string, kind: 'argument' | 'consult' = 'argument') =>
  roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/messages`, 'POST', { kind, ordinal, text, requestKey })
export async function leaveRoom(roomId: string): Promise<LeaveRoomResponse> {
  return LeaveRoomResponse.parse(await roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/leave`, 'POST'))
}

async function isSessionExpired(response: Response): Promise<boolean> {
  if (response.status !== 401) return false
  const value: unknown = await response.clone().json().catch(() => null)
  const body = ErrorResponse.safeParse(value), speech = SpeechErrorResponse.safeParse(value)
  return body.success && body.data.error.code === 'SESSION_EXPIRED' || speech.success && speech.data.error.code === 'SESSION_EXPIRED'
}

/**
 * fetch() for endpoints that need a session. On SESSION_EXPIRED: refresh (shared), then retry
 * once. If the refresh fails, returns the refresh's own response (401 UNAUTHENTICATED: the
 * player has no session any more). `init.body` must be reusable (a string), not a stream.
 */
export async function fetchWithSession(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init)
  if (!(await isSessionExpired(response))) return response
  const refreshed = (await refreshSession()).clone() // each caller reads its own copy
  return refreshed.status === 204 ? fetch(url, init) : refreshed
}

/**
 * GET /api/health. The API answers 200 when everything is up and 503 (same body) when
 * something is down; both carry a health report. Returns null when the API can't be reached:
 * network errors, any other status (e.g. the dev proxy's 502 when the API is down) or a body
 * that doesn't match the contract.
 */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse | null> {
  try {
    const response = await fetch('/api/health', { signal, cache: 'no-store' })
    if (response.status !== 200 && response.status !== 503) return null
    const parsed = HealthResponse.safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
