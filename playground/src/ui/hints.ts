/** One-time tips: each is shown once per browser, then remembered. */
const KEY = 'anatomygo.playground.seen'

function read(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export const seen = (id: string) => read().includes(id)

export function markSeen(id: string) {
  try { if (!seen(id)) localStorage.setItem(KEY, JSON.stringify([...read(), id])) } catch { /* private mode: tips show again next visit */ }
}
