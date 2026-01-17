'use client'

import { useState, useEffect } from 'react'
import { requestNotificationPermission } from '@/lib/firebase/notifications'

export function NotificationPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)

  useEffect(() => {
    const checkAndShowPrompt = async () => {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return
      }

      const permission = Notification.permission
      const dismissed = localStorage.getItem('notificationPromptDismissed')

      if (permission === 'default' && !dismissed) {
        if ('serviceWorker' in navigator) {
          try {
            await navigator.serviceWorker.ready
            console.log('Service worker ready, showing notification prompt')
          } catch (e) {
            console.error('Service worker not ready:', e)
          }
        }
        setTimeout(() => setShowPrompt(true), 1000)
      }
    }

    const timer = setTimeout(checkAndShowPrompt, 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleEnable = async () => {
    setIsRequesting(true)
    try {
      const token = await requestNotificationPermission()
      console.log('Token result:', token ? 'obtained' : 'failed')
    } catch (error) {
      console.error('Failed to enable notifications:', error)
    } finally {
      setIsRequesting(false)
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem('notificationPromptDismissed', 'true')
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-lg mx-auto">
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white flex-shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
            </svg>
          </div>
          <div className="flex-1">
            <h3
              className="font-bold text-white"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              Enable Notifications
            </h3>
            <p
              className="text-sm text-gray-400 mt-1"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              Get notified when your crew sends you an Ahoy!
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleEnable}
                disabled={isRequesting}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-bold uppercase text-sm rounded disabled:opacity-50"
                style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                {isRequesting ? '...' : 'Enable'}
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 text-gray-400 hover:text-white font-bold uppercase text-sm"
                style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
