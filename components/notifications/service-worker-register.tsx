'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Only register the Firebase messaging service worker
      // It handles both push notifications and can be extended for offline support
      navigator.serviceWorker
        .register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('Firebase SW registered:', registration.scope)
        })
        .catch((error) => {
          console.error('Firebase SW registration failed:', error)
        })
    }
  }, [])

  return null
}
