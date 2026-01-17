'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { User } from '@/lib/supabase/types'

interface FriendCardProps {
  friend: User
  onAhoy: (friendId: string) => Promise<void>
}

export function FriendCard({ friend, onAhoy }: FriendCardProps) {
  const [isSending, setIsSending] = useState(false)
  const [justSent, setJustSent] = useState(false)

  const handleAhoy = async () => {
    if (isSending) return

    setIsSending(true)
    try {
      await onAhoy(friend.id)
      setJustSent(true)
      setTimeout(() => setJustSent(false), 1000)
    } catch (error) {
      console.error('Failed to send Ahoy:', error)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <button
      onClick={handleAhoy}
      disabled={isSending}
      className={cn(
        'w-full p-4 flex items-center gap-4',
        'bg-white border-2 border-amber-200 rounded-xl',
        'shadow-sm hover:shadow-md transition-all duration-200',
        'hover:border-amber-400 hover:bg-amber-50',
        'active:scale-[0.98]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        justSent && 'animate-sent border-amber-500'
      )}
    >
      {/* Avatar placeholder with first letter */}
      <div className={cn(
        'w-12 h-12 rounded-full flex items-center justify-center',
        'bg-gradient-to-br from-sky-500 to-sky-600',
        'text-white text-xl font-bold uppercase',
        'shadow-inner',
        justSent && 'animate-splash'
      )}>
        {friend.username.charAt(0)}
      </div>

      {/* Username */}
      <div className="flex-1 text-left">
        <p className="font-semibold text-amber-900">@{friend.username}</p>
        <p className="text-xs text-amber-600">
          {justSent ? 'Ahoy sent!' : 'Tap to send Ahoy'}
        </p>
      </div>

      {/* Ahoy indicator */}
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center',
        'bg-gradient-to-br from-amber-400 to-amber-500',
        'text-white shadow-md',
        justSent && 'from-green-400 to-green-500'
      )}>
        {justSent ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        )}
      </div>
    </button>
  )
}
