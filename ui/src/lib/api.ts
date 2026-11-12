import { HealthResponse } from '@quarrel/shared/contract'

// The only place the UI talks to the backend (see CLAUDE.md).

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
