import { useEffect, useState } from 'react'
import type { HealthResponse } from '@quarrel/shared/contract'
import { getHealth } from './lib/api'

type Status = { state: 'checking' } | { state: 'done'; health: HealthResponse | null }

function statusText(status: Status): string {
  if (status.state === 'checking') return 'API: checking…'
  const { health } = status
  if (!health) return 'API: unreachable'
  return `API: ${health.ok ? 'ok' : 'degraded'} — redis ${health.redis}, supabase ${health.supabase}`
}

function App() {
  const [status, setStatus] = useState<Status>({ state: 'checking' })

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal).then((health) => {
      if (!controller.signal.aborted) setStatus({ state: 'done', health })
    })
    return () => controller.abort()
  }, [])

  return (
    <>
      <h1>Quarrel v2</h1>
      <p>{statusText(status)}</p>
    </>
  )
}

export default App
