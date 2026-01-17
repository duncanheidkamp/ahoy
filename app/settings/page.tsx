'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function SettingsPage() {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout failed:', error)
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-6 h-6 text-amber-600">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">
          Ship Settings
        </h2>
      </div>

      <Card variant="parchment" className="mb-4">
        <CardContent className="pt-4">
          <h3 className="font-semibold text-amber-900 mb-2">Account</h3>
          <p className="text-sm text-amber-700 mb-4">
            Sign out of your account to switch to a different sailor.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleLogout}
            isLoading={isLoggingOut}
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
            </svg>
            Abandon Ship (Logout)
          </Button>
        </CardContent>
      </Card>

      <Card variant="parchment">
        <CardContent className="pt-4">
          <h3 className="font-semibold text-amber-900 mb-2">About</h3>
          <p className="text-sm text-amber-700">
            Ahoy! v0.1.0
          </p>
          <p className="text-xs text-amber-500 mt-1">
            A nautical way to say hello to your crew.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
