/**
 * Sharing one pin. The link opens the Playground on that structure with the pin selected, for anyone: pins can be read
 * without signing in. Phones use their own share sheet; computers copy the link.
 */
import { touch } from './ui/Spotlight'

export function pinLink(structure: string, pin: string) {
  return `${location.origin}/playground/?structure=${encodeURIComponent(structure)}&pin=${encodeURIComponent(pin)}&from=share`
}

/** The words that travel with the link: a question for a pin still being checked, a plain pointer for a published one. */
export function shareText(feature: string, structure: string, published: boolean) {
  return published ? `The ${feature} on the ${structure}, in 3D on AnatomyGo.` : `Is this the ${feature} on the ${structure}? Take a look on AnatomyGo.`
}

export async function sharePin(link: string, text: string, title: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (touch && typeof navigator.share === 'function') {
    try { await navigator.share({ title, text, url: link }); return 'shared' } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled' }
  }
  try { await navigator.clipboard.writeText(link); return 'copied' } catch { return 'failed' }
}
