// Names shared with the backend (supabase/functions/_shared/push.ts) and the
// native config (app.config.ts). Changing a channel's sound on Android needs a
// NEW channel id (ahoy-v2): channel settings are fixed once created.

export const AHOY_CHANNEL_ID = 'ahoy-v1'
export const REQUESTS_CHANNEL_ID = 'requests-v1'
export const AHOY_CATEGORY_ID = 'ahoy'
export const AHOY_BACK_ACTION_ID = 'AHOY_BACK'
export const AHOY_SOUND_FILE = 'ahoy.wav'
export const BACKGROUND_NOTIFICATION_TASK = 'ahoy-background-notification'

export const STORAGE_KEYS = {
  /** The Expo push token this device last registered, and for whom. */
  registeredToken: 'ahoy.push.token',
  /** Notification responses already handled (dedupe across runtimes). */
  handledResponses: 'ahoy.push.handled',
  /** "Ahoy back" sends that couldn't finish in the background. */
  pendingAhoyBacks: 'ahoy.push.pendingBack',
  /** When the user last tapped "Not now" on the pre-prompt. */
  prePromptDismissedAt: 'ahoy.push.prePromptDismissedAt',
} as const
