'use client'

import { messaging, getToken, onMessage } from './config'
import { createClient } from '@/lib/supabase/client'

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null
  }

  if (!('serviceWorker' in navigator)) {
    console.log('Service workers not supported')
    return null
  }

  if (!messaging) {
    console.log('Firebase messaging not available')
    return null
  }

  try {
    const permission = await Notification.requestPermission()
    console.log('Notification permission:', permission)

    if (permission === 'granted') {
      // Register and wait for the Firebase service worker to be fully active
      let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')

      if (!registration) {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
      }

      // Wait for the service worker to be ready and active
      await navigator.serviceWorker.ready

      // If the service worker is still installing or waiting, wait for it to activate
      if (registration.installing || registration.waiting) {
        await new Promise<void>((resolve) => {
          const sw = registration!.installing || registration!.waiting
          sw?.addEventListener('statechange', function handler() {
            if (sw.state === 'activated') {
              sw.removeEventListener('statechange', handler)
              resolve()
            }
          })
          // Also resolve if already activated
          if (registration!.active) resolve()
        })
      }

      console.log('Service worker ready:', registration.scope)

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      })

      console.log('FCM token obtained:', token ? 'yes' : 'no')

      if (token) {
        // Save token to database
        await saveTokenToDatabase(token)
        return token
      }
    }

    return null
  } catch (error) {
    console.error('Error getting notification permission:', error)
    return null
  }
}

async function saveTokenToDatabase(token: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    await supabase
      .from('users')
      .update({ fcm_token: token })
      .eq('id', user.id)
  }
}

export function setupMessageListener(callback: (payload: unknown) => void) {
  if (!messaging) return () => {}

  return onMessage(messaging, (payload) => {
    console.log('Message received:', payload)
    callback(payload)
  })
}
