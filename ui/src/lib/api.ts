import { HealthResponse } from '@quarrel/shared/contract'

// The only place the UI talks to the backend (see CLAUDE.md).

/** GET /api/health. Returns null when the API can't be reached or answers unexpectedly. */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse | null> {
  try {
    const response = await fetch('/api/health', { signal, cache: 'no-store' })
    if (!response.ok) return null // e.g. the dev proxy answers 5xx when the API is down
    const parsed = HealthResponse.safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
