// Notifications that arrive while the app is open. The system banner is
// suppressed for our own push types; the app shows its own banner instead
// (and, for ahoys, plays the sound itself through expo-audio).

import type { NotificationBehavior } from 'expo-notifications'

import { dataOfNotification, type PushData } from './payload'
import type { PushRoute } from './responses'

const SUPPRESS: NotificationBehavior = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
}

const SYSTEM: NotificationBehavior = {
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
}

/** Passed to setNotificationHandler. */
export function foregroundBehavior(data: PushData): NotificationBehavior {
  return data.type === 'unknown' ? SYSTEM : SUPPRESS
}

export interface InAppBanner {
  title: string
  message: string
  route: PushRoute
}

export type QueryGroup = 'stats' | 'friendBadges' | 'requests'

export interface ForegroundDeps {
  showBanner(banner: InAppBanner): void
  playAhoySound(): void
  invalidate(groups: QueryGroup[]): void
}

interface NotificationLike {
  request?: { content?: { title?: string | null; body?: string | null } }
}

/** Passed to addNotificationReceivedListener. */
export function createForegroundDispatcher(deps: ForegroundDeps) {
  return (notification: NotificationLike): PushData['type'] => {
    const data = dataOfNotification(notification)
    const content = notification.request?.content
    switch (data.type) {
      case 'ahoy':
        deps.showBanner({
          title: content?.title || 'Ahoy!',
          message: data.senderUsername ? `@${data.senderUsername}` : '',
          route: '/',
        })
        deps.playAhoySound()
        deps.invalidate(['stats', 'friendBadges'])
        break
      case 'friend_request':
        deps.showBanner({
          title: 'Crew request',
          message: content?.body || `@${data.actorUsername} wants to join your crew`,
          route: '/requests',
        })
        deps.invalidate(['requests'])
        break
      case 'friend_accepted':
        deps.showBanner({
          title: 'New crewmate',
          message: content?.body || `@${data.actorUsername} joined your crew`,
          route: '/',
        })
        deps.invalidate(['friendBadges', 'stats', 'requests'])
        break
      case 'unknown':
        break
    }
    return data.type
  }
}
