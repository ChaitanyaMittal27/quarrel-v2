import { themes } from '@quarrel/shared/config'
import type { DurationSec, Theme } from '@quarrel/shared/contract'
import { useState } from 'react'
import { createGame, joinGame } from './actions'
import type { RoomResponse } from '@quarrel/shared/contract'
import { Field } from './Field'
import type { ActionName, FieldErrors, FieldName, ButtonErrors, FocusRequest } from './errors'

export interface HomeValues { name: string; topic: string; theme: Theme; durationSec: DurationSec; code: string }
interface HomeProps {
  busy: boolean; onAction: (request: () => Promise<RoomResponse>, context?: ActionName) => void
  fieldErrors?: FieldErrors; buttonErrors?: ButtonErrors; focus?: FocusRequest; onClearField?: (field: FieldName) => void
}
export function HomeScreen(props: HomeProps) {
  const [values, setValues] = useState<HomeValues>({ name: '', topic: '', theme: 'courtroom', durationSec: 240, code: '' })
  return <HomeForm {...props} values={values} onEdit={(key, value) => setValues((current) => ({ ...current, [key]: value }))} />
}
export function HomeForm({ busy, onAction, fieldErrors = {}, buttonErrors = {}, focus, onClearField = () => {}, values, onEdit }: HomeProps & {
  values: HomeValues; onEdit: <K extends keyof HomeValues>(key: K, value: HomeValues[K]) => void
}) {
  const { name, topic, theme, durationSec, code } = values
  return <div className="game-home">
    <section className="game-intro"><p className="game-eyebrow">YOUR VOICE. A FAIR HEARING.</p>
      <h1>Good friends.<br />Great disagreements.</h1><p>Pick a question. Take a side. Make your case.</p>
      <p>A private debate for two, with a world of characters to make it your own.</p><a href="#/gallery">Explore the art gallery ↗</a>
    </section>
    <section className="game-panel"><h2>Take your seat</h2>
      <Field name="name" label="Your name" error={fieldErrors.name} focus={focus}><input autoComplete="nickname" value={name} onChange={(e) => { onEdit('name', e.target.value); onClearField('name') }} placeholder="What should we call you?" /></Field>
      <form noValidate onSubmit={(e) => { e.preventDefault(); onAction(() => createGame({ name, topic, theme, durationSec }), 'create') }}>
        <h3>Create a debate</h3><label>Theme<select value={theme} onChange={(e) => onEdit('theme', e.target.value as Theme)}>{themes.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}</select></label>
        <Field name="topic" label="The question" error={fieldErrors.topic} focus={focus}><textarea rows={3} value={topic} onChange={(e) => { onEdit('topic', e.target.value); onClearField('topic') }} placeholder="What deserves a fair hearing?" /></Field>
        <label>Writing time per player<select value={durationSec} onChange={(e) => onEdit('durationSec', Number(e.target.value) as DurationSec)}>{[120, 240, 360, 600].map((n) => <option key={n} value={n}>{n / 60} minutes</option>)}</select></label>
        <button disabled={busy}>Create room</button>
        {buttonErrors.create && <p className="game-field-error">{buttonErrors.create}</p>}
      </form>
      <form className="game-join" noValidate onSubmit={(e) => { e.preventDefault(); onAction(() => joinGame({ name, code }), 'join') }}>
        <h3>Have an invitation?</h3><Field name="code" label="Room code" error={fieldErrors.code} focus={focus}><input value={code} onChange={(e) => { onEdit('code', e.target.value.toUpperCase()); onClearField('code') }} autoCapitalize="characters" spellCheck={false} placeholder="K7M2QX" /></Field><button disabled={busy}>Join room</button>
        {buttonErrors.join && <p className="game-field-error">{buttonErrors.join}</p>}
      </form>
    </section>
  </div>
}
