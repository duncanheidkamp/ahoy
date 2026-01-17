'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requestNotificationPermission } from '@/lib/firebase/notifications'

export function NotificationPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)

  useEffect(() => {
    // Check if we should show the prompt
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = Notification.permission
      const dismissed = localStorage.getItem('notificationPromptDismissed')

      if (permission === 'default' && !dismissed) {
        // Delay showing prompt for better UX
        const timer = setTimeout(() => setShowPrompt(true), 2000)
        return () => clearTimeout(timer)
      }
    }
  }, [])

  const handleEnable = async () => {
    setIsRequesting(true)
    try {
      const token = await requestNotificationPermission()
      if (token) {
        // Save token to server
        await fetch('/api/users/fcm-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      }
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
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-lg mx-auto">
      <Card className="shadow-xl border-2 border-amber-300">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-white flex-shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">Enable Notifications</h3>
              <p className="text-sm text-amber-700 mt-1">
                Get notified when your crew sends you an Ahoy!
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={handleEnable} isLoading={isRequesting}>
                  Enable
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss}>
                  Not now
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
