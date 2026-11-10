import { useQueryClient } from '@tanstack/react-query'
import * as Notifications from 'expo-notifications'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'

import { useToast } from '@/components/toast'
import { kv } from '../kv'
import { queryKeys } from '../queries'
import { STORAGE_KEYS } from './constants'
import { pushEvents, pushRoutes } from './events'
import { createForegroundDispatcher, type QueryGroup } from './foreground'
import { ahoyBackQueue, checkLastNotificationResponse, getPermission, registrationDeps } from './native'
import { shouldOfferPrePrompt } from './prompt'
import { registerForPush } from './registration'
import { playAhoySound } from './sound'

const GROUP_KEYS: Record<QueryGroup, readonly string[]> = {
  stats: queryKeys.stats,
  friendBadges: queryKeys.friendBadges,
  requests: queryKeys.requests,
}

function onActive(fn: () => void) {
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') fn()
  })
  return () => sub.remove()
}

function clearBadge() {
  // We never set a badge from the server; this clears anything the OS or an
  // older build left behind.
  Notifications.setBadgeCountAsync(0).catch(() => {})
}

/**
 * Root-level (signed in or not): foreground notifications -> in-app banner,
 * sound and query invalidation; badge cleared whenever the app is active.
 */
export function usePushForeground() {
  const qc = useQueryClient()

  useEffect(() => {
    const invalidate = (groups: QueryGroup[]) => {
      for (const g of groups) void qc.invalidateQueries({ queryKey: GROUP_KEYS[g] })
    }
    const dispatch = createForegroundDispatcher({
      showBanner: (banner) => pushEvents.emit({ type: 'banner', banner }),
      playAhoySound,
      invalidate,
    })
    const received = Notifications.addNotificationReceivedListener(dispatch)
    const sent = pushEvents.subscribe((e) => {
      if (e.type === 'sent') invalidate(['stats'])
    })
    clearBadge()
    const active = onActive(clearBadge)
    return () => {
      received.remove()
      sent()
      active()
    }
  }, [qc])
}

const REGISTER_THROTTLE_MS = 30_000

/**
 * Signed-in only (app/(app)/_layout.tsx): keep this device's token registered,
 * finish any queued "Ahoy back"s, handle the last notification response, and
 * follow routes requested by notification taps.
 */
export function usePushSession(userId: string) {
  const toast = useToast()
  const lastRegister = useRef(0)

  useEffect(() => {
    let cancelled = false

    const register = (force = false) => {
      const now = Date.now()
      if (!force && now - lastRegister.current < REGISTER_THROTTLE_MS) return
      lastRegister.current = now
      void registerForPush(registrationDeps, userId)
    }

    const flush = async () => {
      const sent = await ahoyBackQueue.flush()
      if (cancelled) return
      for (const item of sent) {
        toast(item.senderUsername ? `Ahoy sent back to @${item.senderUsername}` : 'Ahoy sent back')
      }
    }

    const go = () => {
      const route = pushRoutes.take()
      if (route) router.navigate(route)
    }

    const wake = () => {
      register()
      void checkLastNotificationResponse().then(() => {
        if (!cancelled) go()
      })
      void flush()
    }

    register(true)
    void flush()
    go()
    const routes = pushRoutes.subscribe(() => go())
    const active = onActive(wake)
    const tokens = Notifications.addPushTokenListener(() => register(true))
    const toasts = pushEvents.subscribe((e) => {
      if (e.type === 'toast') toast(e.message)
    })
    return () => {
      cancelled = true
      routes()
      active()
      tokens.remove()
      toasts()
    }
  }, [toast, userId])
}

let offeredThisSession = false

/** Crew screen: show the pre-prompt once there is a crew (see prompt.ts). */
export function usePrePromptOffer(crewCount: number) {
  useFocusEffect(
    useCallback(() => {
      if (offeredThisSession || crewCount < 1) return
      let cancelled = false
      void (async () => {
        const [permission, dismissedAt] = await Promise.all([
          getPermission(),
          kv.get<number>(STORAGE_KEYS.prePromptDismissedAt),
        ])
        const offer = shouldOfferPrePrompt({
          permission,
          crewCount,
          dismissedAt,
          now: Date.now(),
          offeredThisSession,
        })
        if (offer && !cancelled) {
          offeredThisSession = true
          router.push('/enable-notifications')
        }
      })()
      return () => {
        cancelled = true
      }
    }, [crewCount])
  )
}
