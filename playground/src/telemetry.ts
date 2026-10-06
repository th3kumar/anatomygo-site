/**
 * Playground usage statistics, through the site's shared module (app/analytics.ts): the same measurement ID, the same
 * opt-out (About on the homepage) and the same rule. Events carry fixed names, atlas IDs, flags
 * and bucketed counts; never search text, pin names, notes, comments, emails or account IDs.
 */
import { bucket, queryKind, startAnalytics, track } from '../../app/analytics'

export { bucket, queryKind, track }

/** The page is reported as /playground/ only: the address can hold a sign-in code, and IDs travel in events. */
export const startPlaygroundAnalytics = () => startAnalytics(`${location.origin}/playground/`, 'Playground · AnatomyGo')

/** A rough kind of failure, so errors can be counted without sending their text. */
export function errorKind(message: string) {
  const m = message.toLowerCase()
  return /network|fetch|download|offline|could not be loaded/.test(m) ? 'network'
    : /jwt|sign|session|token|oauth|google/.test(m) ? 'auth'
    : /permission|policy|denied|not allowed|row-level/.test(m) ? 'permission'
    : /model|geometry|mismatch|structure/.test(m) ? 'model' : 'other'
}

const SIGN_IN = 'anatomygo.playground.signin'
/** Notes how a sign-in began, surviving the Google redirect, so its completion is counted once and attributed. */
export function signInStarted(method: 'google_button' | 'google_window' | 'redirect') {
  try { sessionStorage.setItem(SIGN_IN, method) } catch { /* the completion just goes unattributed */ }
  track('sign_in_started', { method })
}
export function signInFinished(): string | null {
  try { const method = sessionStorage.getItem(SIGN_IN); sessionStorage.removeItem(SIGN_IN); return method } catch { return null }
}
