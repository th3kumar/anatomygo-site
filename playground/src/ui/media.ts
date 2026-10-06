import { useSyncExternalStore } from 'react'

/** Phones and narrow windows get the one-sheet layout. Matches the 799px breakpoint in public.css. */
const phoneQuery = typeof matchMedia === 'function' ? matchMedia('(max-width: 799px)') : null

export const isPhone = () => phoneQuery?.matches ?? false

export function usePhone() {
  return useSyncExternalStore((l) => { phoneQuery?.addEventListener('change', l); return () => phoneQuery?.removeEventListener('change', l) }, isPhone)
}
