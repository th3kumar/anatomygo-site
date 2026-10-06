import { useEffect, useRef, useState } from 'react'
import { cloud, saveDraft, signInWithGoogle, type Draft } from './cloud'
import { Dialog } from './Dialog'
import { googleButtonAvailable, showGoogleButton } from './google'
import { useAppearance } from './theme'
import { errorKind, signInStarted, track } from './telemetry'

/**
 * Sign-in. Google's own button when it is configured (it names this site and opens Google's small window); otherwise,
 * or if that fails, the Supabase flow in a small window on desktop and a redirect on phones.
 */
export function SignInDialog({ draft, structure, onClose }: { draft: Draft | null; structure: string; onClose(): void }) {
  const { dark } = useAppearance()
  const slot = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'google' | 'fallback'>(googleButtonAvailable ? 'google' : 'fallback')
  const [ready, setReady] = useState(false)
  const [problem, setProblem] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode !== 'google' || !slot.current) return
    let live = true
    saveDraft(draft)
    setReady(false)
    showGoogleButton(slot.current, { dark, width: Math.min(320, slot.current.clientWidth || 320) }, (error) => {
      // Success needs nothing here: the page sees the new session and closes this dialog.
      if (error) track('sign_in_failed', { method: 'google_button', kind: errorKind(error) })
      if (error && live) { setProblem(`Google sign-in didn’t finish (${error}).`); setMode('fallback') }
    }, () => signInStarted('google_button')).then(() => { if (live) setReady(true) }).catch(() => { track('google_button_unavailable'); if (live) setMode('fallback') })
    return () => { live = false }
  }, [mode, dark]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fallback() {
    setBusy(true)
    setProblem('')
    try {
      saveDraft(draft)
      if (await signInWithGoogle(structure, signInStarted) === 'popup') setWaiting(true)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      track('sign_in_failed', { method: 'fallback', kind: errorKind(message) })
      setProblem(message)
    } finally { setBusy(false) }
  }

  return (
    <Dialog title="Sign in to save" onClose={onClose}>
      <p>{waiting ? 'Finish signing in in the Google window. This page updates by itself.' : `Sign in to save pins, vote and comment.${draft ? ' Your pin stays right here.' : ''}`}</p>
      {!cloud ? <p className="pg-warn">Saving is switched off in this preview.</p> : mode === 'google' ? (
        <>
          <div className="pg-google">
            <div ref={slot} className="pg-google-slot" aria-busy={!ready} />
            {!ready && <span className="pg-google-wait">Loading Google sign-in…</span>}
          </div>
          {/* Google's button stays silent if it ever refuses this address (a new domain, say); this keeps a way in. */}
          <button className="link pg-google-other" onClick={() => { track('sign_in_fallback_opened'); setMode('fallback') }}>Trouble signing in? Use Google’s sign-in page</button>
        </>
      ) : (
        <button className={waiting ? 'outline wide' : 'primary wide'} disabled={busy} onClick={() => void fallback()}>
          {waiting ? 'Open the Google window again' : 'Continue with Google'}
        </button>
      )}
      {problem && <p className="pg-warn">{problem}</p>}
      <p className="note">We use Google only to sign you in. Your email is never shown.</p>
    </Dialog>
  )
}
