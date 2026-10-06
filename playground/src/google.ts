/**
 * Google's own sign-in button (Google Identity Services). Google then names this site (anatomygo.in) in its prompt
 * rather than the Supabase host, and shows its small native sign-in window. The ID token it returns is exchanged with
 * Supabase (signInWithIdToken); the nonce ties that token to this one button.
 * Without a client ID, or if Google's script cannot load, callers fall back to signInWithGoogle in cloud.ts.
 */
import { cloud } from './cloud'

interface GoogleId {
  initialize(options: Record<string, unknown>): void
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void
  cancel(): void
}
declare global { interface Window { google?: { accounts: { id: GoogleId } } } }

const client = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim()
export const googleButtonAvailable = !!client && !!cloud

let script: Promise<GoogleId> | null = null
function load() {
  return script ??= new Promise<GoogleId>((resolve, reject) => {
    if (window.google?.accounts.id) return resolve(window.google.accounts.id)
    const tag = document.createElement('script')
    tag.src = 'https://accounts.google.com/gsi/client'
    tag.async = true
    tag.onload = () => (window.google?.accounts.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not start.')))
    tag.onerror = () => { script = null; tag.remove(); reject(new Error('Google sign-in could not load.')) }
    document.head.appendChild(tag)
  })
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Draws Google's button into `parent`. A click there signs in; `onDone` gets null or the reason it failed. */
export async function showGoogleButton(parent: HTMLElement, look: { dark: boolean; width: number }, onDone: (error: string | null) => void) {
  const id = await load()
  const nonce = crypto.randomUUID()
  id.initialize({
    client_id: client,
    nonce: await sha256(nonce),  // Google receives the hash; Supabase checks the token against the original
    ux_mode: 'popup',
    use_fedcm_for_button: true,
    itp_support: true,
    context: 'signin',
    callback: async ({ credential }: { credential: string }) => {
      const { error } = await cloud!.auth.signInWithIdToken({ provider: 'google', token: credential, nonce })
      onDone(error ? error.message : null)
    },
  })
  parent.replaceChildren()
  id.renderButton(parent, { type: 'standard', theme: look.dark ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'center', width: look.width })
}
