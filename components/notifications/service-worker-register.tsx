'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Register the Firebase messaging service worker with root scope
      navigator.serviceWorker
        .register('/firebase-messaging-sw.js', { scope: '/' })
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
