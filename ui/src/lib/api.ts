import { ErrorResponse, HealthResponse, RoomResponse, LeaveRoomResponse } from '@quarrel/shared/contract'

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
  constructor(code: string, message: string) { super(message); this.code = code }
}

async function failure(response: Response): Promise<never> {
  const parsed = ErrorResponse.safeParse(await response.json().catch(() => null))
  throw parsed.success ? new ApiError(parsed.data.error.code, parsed.data.error.message)
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

export const getSession = () => roomRequest('/api/session')
export const createRoom = (name: string) => roomRequest('/api/rooms', 'POST', { name })
export const joinRoom = (name: string, code: string) => roomRequest('/api/rooms/join', 'POST', { name, code })
export const setReady = (roomId: string, ready: boolean) => roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/ready`, 'PUT', { ready })
export async function leaveRoom(roomId: string): Promise<LeaveRoomResponse> {
  return LeaveRoomResponse.parse(await roomRequest(`/api/rooms/${encodeURIComponent(roomId)}/leave`, 'POST'))
}

async function isSessionExpired(response: Response): Promise<boolean> {
  if (response.status !== 401) return false
  const body = ErrorResponse.safeParse(await response.clone().json().catch(() => null))
  return body.success && body.data.error.code === 'SESSION_EXPIRED'
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
