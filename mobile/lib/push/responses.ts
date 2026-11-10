// What happens when the user interacts with a notification. One handler for
// every entry point (see lib/push/bootstrap.ts):
//   * addNotificationResponseReceivedListener — app running (fg or bg)
//   * getLastNotificationResponseAsync()      — cold start / next foreground
//   * Android background task                 — action tapped while the app
//                                               is backgrounded or killed
// The same response can arrive through more than one of these, so every
// response is claimed by (request id, action) first and handled once.

import type { AhoyBackQueue, AttemptResult } from './ahoy-back'
import { AHOY_BACK_ACTION_ID } from './constants'
import type { Dedupe } from './dedupe'
import { normalizeResponse } from './payload'

/** Same value as expo-notifications' DEFAULT_ACTION_IDENTIFIER (checked in tests). */
export const DEFAULT_ACTION_ID = 'expo.modules.notifications.actions.DEFAULT'

export type PushRoute = '/' | '/requests'

export type ResponseSource = 'listener' | 'last-response' | 'task'

export type HandleResult =
  | { kind: 'ignored' }
  | { kind: 'duplicate' }
  | { kind: 'navigated'; route: PushRoute }
  | { kind: 'ahoy_back'; result: AttemptResult }

export interface ResponseDeps {
  dedupe: Dedupe
  ahoyBack: AhoyBackQueue
  /** Android leaves the notification up after an action button; remove it. */
  dismiss(requestId: string): Promise<void>
  /** Queue a route for the signed-in navigator. */
  navigate(route: PushRoute): void
  /** Toast if the app UI is up; no-op otherwise. */
  notify(message: string): void
  isForeground(): boolean
}

export function createResponseHandler(deps: ResponseDeps) {
  return {
    async handle(raw: unknown, _source: ResponseSource): Promise<HandleResult> {
      const response = normalizeResponse(raw)
      if (!response) return { kind: 'ignored' }

      const { actionIdentifier, data } = response
      const relevant =
        (actionIdentifier === AHOY_BACK_ACTION_ID && data.type === 'ahoy') || actionIdentifier === DEFAULT_ACTION_ID
      if (!relevant) return { kind: 'ignored' }

      if (!(await deps.dedupe.claim(response.key))) return { kind: 'duplicate' }

      if (actionIdentifier === DEFAULT_ACTION_ID) {
        const route: PushRoute = data.type === 'friend_request' ? '/requests' : '/'
        deps.navigate(route)
        return { kind: 'navigated', route }
      }

      // AHOY_BACK on an ahoy.
      if (data.type !== 'ahoy') return { kind: 'ignored' }
      deps.dismiss(response.requestId).catch(() => {})
      const result = await deps.ahoyBack.attempt({
        key: response.key,
        senderId: data.senderId,
        senderUsername: data.senderUsername,
      })
      if (result === 'sent' && deps.isForeground()) {
        deps.notify(data.senderUsername ? `Ahoy sent back to @${data.senderUsername}` : 'Ahoy sent back')
      }
      return { kind: 'ahoy_back', result }
    },
  }
}

export type ResponseHandler = ReturnType<typeof createResponseHandler>
