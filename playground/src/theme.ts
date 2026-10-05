/** Light or dark appearance, as on anatomygo.in: follow the system (default), or a saved choice. The `dark` class on
 * <html> drives the stylesheet; the 3D stage reads the same class so the two never disagree. */
import { useSyncExternalStore } from 'react'

export type Appearance = 'system' | 'light' | 'dark'
const KEY = 'anatomygo.appearance'
const media = matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()
const root = document.documentElement

export function appearance(): Appearance {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system' } catch { return 'system' }
}
export const isDark = (a: Appearance) => a === 'dark' || (a === 'system' && media.matches)

function apply() {
  const dark = isDark(appearance())
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  listeners.forEach((l) => l())
}
media.addEventListener('change', apply)
apply()

export function setAppearance(a: Appearance) {
  try { if (a === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, a) } catch { /* private mode */ }
  apply()
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export function useAppearance(): { choice: Appearance; dark: boolean } {
  const choice = useSyncExternalStore(subscribe, appearance)
  const dark = useSyncExternalStore(subscribe, () => root.classList.contains('dark'))
  return { choice, dark }
}
