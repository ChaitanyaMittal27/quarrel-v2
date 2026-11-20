import { useEffect, useState } from 'react'
import { availableAi } from '@quarrel/shared/contract'
import { getAiStatus } from './api'

/** Public operational status only: this polling never reads or advances a room/game clock. */
export function useAiStatus(roomVersion?: number) {
  const [status, setStatus] = useState(availableAi)
  useEffect(() => {
    const abort = new AbortController()
    const refresh = async () => {
      try {
        const next = await getAiStatus(abort.signal)
        if (!abort.signal.aborted) setStatus(next)
      } catch { /* Preserve the last status during outages; reconnect owns the banner. */ }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 15000)
    const focus = () => void refresh()
    window.addEventListener('focus', focus)
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [roomVersion])
  return status
}
