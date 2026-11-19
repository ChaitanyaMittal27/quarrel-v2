import { useEffect, useId, useRef, type ReactElement, type ComponentProps } from 'react'
import { focusInvalidField, type FieldName, type FocusRequest } from './errors'
export function Field({ name, label, error, focus, children }: {
  name: FieldName; label: string; error?: string; focus?: FocusRequest
  children: ReactElement<ComponentProps<'input'> | ComponentProps<'textarea'>>
}) {
  const id = useId(), errorId = `${id}-error`
  const input = useRef<HTMLInputElement>(null), textarea = useRef<HTMLTextAreaElement>(null)
  const multiline = children.type === 'textarea'
  useEffect(() => { if (error) focusInvalidField(multiline ? textarea.current : input.current, name, focus) }, [error, focus, name, multiline])
  const attributes = {
    id, 'aria-invalid': !!error, 'aria-describedby': error ? errorId : undefined,
    className: error ? 'game-input-invalid' : undefined,
  }
  return <div className="game-field"><label htmlFor={id}>{label}</label>
    {multiline ? <textarea {...children.props as ComponentProps<'textarea'>} {...attributes} ref={textarea} />
      : <input {...children.props as ComponentProps<'input'>} {...attributes} ref={input} />}
    {error && <p className="game-field-error" id={errorId}>{error}</p>}</div>
}
