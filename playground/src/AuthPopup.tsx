import { useEffect, useState } from 'react'
import { AUTH_CHANNEL, cloud } from './cloud'
import './theme'

/**
 * The small Google window lands here. The Supabase client finishes the sign-in from the address on start-up; this page
 * tells the Playground that opened it and closes. Nothing else of the Playground loads in this window.
 */
export function AuthPopup() {
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working')
  const [detail, setDetail] = useState('')
  useEffect(() => {
    const problem = new URLSearchParams(location.search).get('error_description') ?? new URLSearchParams(location.hash.slice(1)).get('error_description')
    if (problem || !cloud) { setDetail(problem ?? 'Sign-in is not available here.'); setState('failed'); return }
    cloud.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) { setDetail(error?.message ?? ''); setState('failed'); return }
      setState('done')
      try { const channel = new BroadcastChannel(AUTH_CHANNEL); channel.postMessage('signed-in'); channel.close() } catch { /* the opener also re-reads the session on focus */ }
      setTimeout(() => window.close(), 400)
    })
  }, [])
  return (
    <main className="pg-auth-popup">
      <div className="centre-card glass">
        <h2>{state === 'working' ? 'Signing you in…' : state === 'done' ? 'You’re signed in' : 'Sign-in didn’t finish'}</h2>
        <p>{state === 'working' ? 'One moment.' : state === 'done' ? 'This window closes by itself. You can go back to the Playground.' : `${detail ? detail + ' ' : ''}Close this window and try again.`}</p>
        {state !== 'working' && <button className="primary" onClick={() => window.close()}>Close window</button>}
      </div>
    </main>
  )
}
