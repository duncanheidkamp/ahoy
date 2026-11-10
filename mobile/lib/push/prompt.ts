// When to show the "turn on notifications" pre-prompt. Not at signup: only
// once the user has a crew (first friend accepted), so the ask makes sense.
// "Not now" re-offers on a later app open, at least REOFFER_AFTER_MS later.

export const REOFFER_AFTER_MS = 3 * 24 * 60 * 60 * 1000

export interface PermissionLike {
  status: 'granted' | 'denied' | 'undetermined'
  canAskAgain: boolean
}

export interface PrePromptInput {
  permission: PermissionLike
  crewCount: number
  /** ms epoch of the last "Not now", or null. */
  dismissedAt: number | null
  now: number
  /** Already offered during this app session (process lifetime). */
  offeredThisSession: boolean
}

export function shouldOfferPrePrompt(i: PrePromptInput): boolean {
  if (i.offeredThisSession) return false
  if (i.crewCount < 1) return false
  if (i.permission.status === 'granted') return false
  // iOS asks once; after a denial only the Settings app can turn it on.
  if (!i.permission.canAskAgain) return false
  if (i.dismissedAt !== null && i.now - i.dismissedAt < REOFFER_AFTER_MS) return false
  return true
}

export type NotificationSetting = 'on' | 'off' | 'blocked'

/** For the Settings row: 'blocked' means only the system Settings app can fix it. */
export function notificationSetting(p: PermissionLike): NotificationSetting {
  if (p.status === 'granted') return 'on'
  return p.canAskAgain ? 'off' : 'blocked'
}
