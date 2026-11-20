import { SpeechPlaybackNotice } from '../speech/SpeechControls'
import { AudioSettings } from '../speech/AudioSettings'
import type { HealthResponse, RoomResponse, RoomSnapshot } from '@quarrel/shared/contract'
import { getTheme } from '@quarrel/shared/config'
import { connectionNotice } from './actions'
import { HomeScreen } from './HomeScreen'
import { AfterGame } from '../results/AfterGame'
import { SummaryCard } from './Judgment'
import { RoomScreen } from './RoomScreen'
import { PrivateNotes } from './Consultations'
import { themeStyles } from '../themes/styles'
import { SettingsPanel } from '../settings/SettingsPanel'
import { RoomStage } from '../components/art/RoomStage'
import type { DisplayPreferences } from '../settings/display-preferences'
import type { ConnectionStatus } from '../lib/socket'
import type { ChoiceKind } from '../settings/choices'
import type { ActionName, FieldErrors, FieldName, ButtonErrors, FocusRequest } from './errors'

export interface GameViewProps {
  room: RoomSnapshot | null; clock: { receivedAt: number; now: number }; health: HealthResponse | null
  loading: boolean; busy: boolean; error: string; notice: string; positionDraft: string; argument: string
  copied: boolean; connection: ConnectionStatus; settingsOpen: boolean
  display: { preferences: DisplayPreferences; storageAvailable: boolean }
  onSettings: () => void; onDismiss: () => void; onCopy: () => void; onLeave: () => void
  onAction: (request: () => Promise<RoomResponse>, context?: ActionName) => void
  fieldErrors?: FieldErrors; buttonErrors?: ButtonErrors; focus?: FocusRequest
  onClearField?: (field: FieldName) => void
  onDisplay: (preferences: DisplayPreferences) => void; onPick: (kind: ChoiceKind, id: string) => void
  onPosition: (text: string) => void; onArgument: (text: string) => void
  onSave: () => void; onReady: () => void; onStart: () => void; onSend: () => void
  judgeSpeaking?: boolean
  onRematch?: () => void
  onRetryJury?: () => void
  question?: string; onQuestion?: (text: string) => void; onAsk?: () => void; speakingSlot?: 'A' | 'B' | null
}
// A display-only shell keeps phase fixtures testable in Node without a DOM dependency.
export function GameView({ room, clock, health, loading, busy, error, notice, positionDraft, argument,
  copied, connection, settingsOpen, display, onSettings, onDismiss, onCopy, onLeave, onAction,
  onDisplay, onPick, onPosition, onArgument, onSave, onReady, onStart, onSend,
  fieldErrors = {}, buttonErrors = {}, focus, onClearField, question, onQuestion, onAsk, speakingSlot, onRetryJury, onRematch, judgeSpeaking }: GameViewProps) {
  const ownSeat = room?.players.find((p) => p.slot === room.you.slot)
  return <div className="art-scope game-shell" style={themeStyles(getTheme(room?.setup.theme ?? 'courtroom'))}
    data-motion-preference={display.preferences.reducedMotion} data-reduced-motion={display.preferences.reducedMotion === 'on'} data-text-size={display.preferences.textSize}>
    <a className="game-skip" href="#game-content">Skip to game</a>
    <header className="game-header"><a className="game-brand" href="#/">quarrel<span>.</span>io</a><span className="game-tagline">YOUR VOICE.<br />A FAIR HEARING.</span><nav aria-label="Main navigation"><a href="#/results">My results</a><a href="#/gallery">Art gallery</a>{room && <button aria-expanded={settingsOpen} aria-controls="room-settings" onClick={onSettings}>Settings</button>}</nav></header>
    <main id="game-content" className="game-content">
      {error && connection !== 'reconnecting' && <div className="game-notice" role="alert">{error}<button onClick={onDismiss}>Dismiss</button></div>}
      {room && connectionNotice(connection) && <p className="game-reconnecting" role="status">{connectionNotice(connection)}</p>}
      {notice && <p className="game-notice" role="status">{notice}</p>}
      {loading ? <section className="game-panel" role="status">Finding your seat...</section> : !room ? <HomeScreen busy={busy} onAction={onAction} fieldErrors={fieldErrors} buttonErrors={buttonErrors} focus={focus} onClearField={onClearField} /> : <>
        <section className="game-topic"><div><p className="game-eyebrow">{getTheme(room.setup.theme).displayName} / {room.setup.durationSec / 60} MINUTES EACH</p><h1>{room.setup.topic}</h1></div><span className="game-connection" role="status"><i data-status={connection} />{connection}</span></section>
        <div className="game-room-tools"><div><span className="game-eyebrow">PRIVATE ROOM </span><strong className="game-code">{room.code}</strong> <button onClick={onCopy}>{copied ? 'Copied' : 'Copy code'}</button></div><button disabled={busy} onClick={onLeave}>Leave room</button></div>
        {buttonErrors.leave && <p className="game-field-error">{buttonErrors.leave}</p>}
        {settingsOpen && ownSeat && <section id="room-settings" className="game-panel">{buttonErrors.settings && <p className="game-field-error">{buttonErrors.settings}</p>}<SettingsPanel player={ownSeat} ended={['ended', 'complete'].includes(room.setup.phase)} busy={busy} preferences={display.preferences} storageAvailable={display.storageAvailable} onDisplay={onDisplay} onPick={onPick} /><AudioSettings/></section>}
        <div className="game-court"><div className="game-arena-column"><div className="game-arena-wrap"><RoomStage room={room} receivedAt={clock.receivedAt} now={clock.now} preferences={display.preferences} speakingSlot={speakingSlot} judgeSpeaking={judgeSpeaking} /><SpeechPlaybackNotice/>{room.summary && <SummaryCard room={room} />}</div><div className="game-seats">{room.players.map((player) => <div key={player.slot}><strong>{player.name}{player.slot === room.you.slot ? ' (you)' : ''}</strong><p>{player.left ? 'Left the room' : `${player.ready ? 'Ready' : 'Not ready'} / ${player.connected ? 'Connected' : 'Disconnected'}`}</p></div>)}</div></div>
          <div className="game-play-column"><RoomScreen room={room} busy={busy} position={positionDraft} argument={argument} receivedAt={clock.receivedAt} now={clock.now} onPosition={onPosition} onArgument={onArgument} onSave={onSave} onReady={onReady} onStart={onStart} onSend={onSend} fieldErrors={fieldErrors} buttonErrors={buttonErrors} focus={focus} onRetryJury={onRetryJury} question={question} onQuestion={onQuestion} onAsk={onAsk} />{room.setup.phase === 'complete' && <AfterGame key={room.debateId} room={room} busy={busy} onRematch={onRematch} error={buttonErrors.rematch} />}<PrivateNotes room={room} /></div></div>
        <p className="game-expiry">Room expires {new Date(room.expiresAt).toLocaleString()}</p>
      </>}
    </main><footer className="game-footer"><span>Two perspectives. One fair hearing.</span><small>API: {health ? `${health.ok ? 'ok' : 'degraded'} / Redis ${health.redis} / Postgres ${health.postgres}` : 'unreachable'}</small></footer>
  </div>
}
