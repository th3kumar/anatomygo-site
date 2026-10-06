import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'

/**
 * In-app replacements for window.confirm and window.prompt, so every question uses the AnatomyGo look.
 *   if (await ask({ title, body, confirm })) ...
 *   const reason = await askText({ title, label })
 */
interface Request {
  title: string
  body?: string
  confirm: string
  cancel?: string
  danger?: boolean
  input?: { label: string; placeholder?: string; maxLength?: number }
  resolve(value: string | boolean | null): void
}

let current: Request | null = null
const listeners = new Set<() => void>()
const publish = (next: Request | null) => { current = next; listeners.forEach((l) => l()) }

export function ask(options: Omit<Request, 'resolve' | 'input'>): Promise<boolean> {
  return new Promise((resolve) => publish({ ...options, resolve: (v) => resolve(v === true) }))
}

export function askText(options: Omit<Request, 'resolve'> & { input: NonNullable<Request['input']> }): Promise<string | null> {
  return new Promise((resolve) => publish({ ...options, resolve: (v) => resolve(typeof v === 'string' ? v : null) }))
}

/** Renders the active question. Mount once near the root. */
export function AskHost() {
  const request = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => current)
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  useEffect(() => {
    setText('')
    if (request) dialog.current?.showModal()
    else dialog.current?.close()
  }, [request])
  if (!request) return null
  const finish = (value: string | boolean | null) => { request.resolve(value); publish(null) }
  const valid = !request.input || text.trim().length > 0
  return (
    <dialog ref={dialog} className="pg-dialog pg-ask" aria-label={request.title} onCancel={(e) => { e.preventDefault(); finish(null) }}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (valid) finish(request.input ? text.trim() : true) }}>
        <header>
          <h2 className="dialog-title">{request.title}</h2>
          <button type="button" className="icon" aria-label="Close" onClick={() => finish(null)}><X size={16} /></button>
        </header>
        {request.body && <p>{request.body}</p>}
        {request.input && (
          <label className="field">{request.input.label}
            <textarea autoFocus rows={3} maxLength={request.input.maxLength ?? 1000} placeholder={request.input.placeholder}
                      value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        <footer className="pg-dialog-actions">
          <button type="button" className="ghost" onClick={() => finish(null)}>{request.cancel ?? 'Cancel'}</button>
          <button type="submit" className={request.danger ? 'danger-solid' : 'primary'} disabled={!valid} autoFocus={!request.input}>{request.confirm}</button>
        </footer>
      </form>
    </dialog>
  )
}
