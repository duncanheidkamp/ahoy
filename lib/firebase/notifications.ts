'use client'

import { messaging, getToken, onMessage } from './config'
import { createClient } from '@/lib/supabase/client'

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

export async function requestNotificationPermission(): Promise<string | null> {
  if (!messaging) {
    console.log('Firebase messaging not available')
    return null
  }

  try {
    const permission = await Notification.requestPermission()

    if (permission === 'granted') {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY })

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
