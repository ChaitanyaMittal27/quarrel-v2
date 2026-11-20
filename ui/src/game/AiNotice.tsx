import type { AiStatus } from '@quarrel/shared/contract'
import { resetLabel } from '../lib/judgment'

export function AiNotice({ status }: { status: AiStatus }) {
  return <>
    {status.text === 'exhausted' && <p className="game-ai-notice" role="status">Today's free AI limit is reached. The game continues with simpler fallbacks; verdicts can be retried after {resetLabel(status)}.</p>}
    {status.voice === 'off' && <p className="game-voice-notice" role="status">Voice is resting until {resetLabel(status)}.</p>}
  </>
}
