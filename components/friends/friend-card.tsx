'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { getBadge } from '@/lib/utils'
import type { User, UserWithAhoyCount } from '@/lib/supabase/types'

// Yo-inspired color palette
const COLORS = [
  'bg-purple-500 hover:bg-purple-600 active:bg-purple-700',
  'bg-blue-500 hover:bg-blue-600 active:bg-blue-700',
  'bg-green-500 hover:bg-green-600 active:bg-green-700',
  'bg-orange-500 hover:bg-orange-600 active:bg-orange-700',
  'bg-pink-500 hover:bg-pink-600 active:bg-pink-700',
  'bg-teal-500 hover:bg-teal-600 active:bg-teal-700',
  'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700',
  'bg-rose-500 hover:bg-rose-600 active:bg-rose-700',
]

interface FriendCardProps {
  friend: User | UserWithAhoyCount
  onAhoy: (friendId: string) => Promise<void>
  index: number
  phrase?: string
}

export function FriendCard({ friend, onAhoy, index, phrase = 'Ahoy!' }: FriendCardProps) {
  const [isSending, setIsSending] = useState(false)
  const [showAhoy, setShowAhoy] = useState(false)

  const colorClass = COLORS[index % COLORS.length]

  const handleAhoy = async () => {
    if (isSending) return

    setIsSending(true)
    setShowAhoy(true)

    try {
      await onAhoy(friend.id)
      // Keep showing "AHOY!" for 2 seconds
      setTimeout(() => {
        setShowAhoy(false)
        setIsSending(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to send Ahoy:', error)
      setShowAhoy(false)
      setIsSending(false)
    }
  }

  // Remove @ symbol and capitalize first letter
  const displayName = friend.username.charAt(0).toUpperCase() + friend.username.slice(1)

  // Get badge if user has ahoy count
  const ahoyCount = 'ahoyCount' in friend ? friend.ahoyCount : undefined
  const badge = ahoyCount !== undefined ? getBadge(ahoyCount) : null

  // Per-friend counter: how many ahoys current user has sent to this friend
  const myAhoysToThem = 'myAhoysToThem' in friend ? (friend.myAhoysToThem ?? 0) : 0

  return (
    <button
      onClick={handleAhoy}
      disabled={isSending}
      className={cn(
        'w-full py-6 px-4',
        'text-white text-2xl font-bold uppercase tracking-wider',
        'transition-all duration-150',
        'flex items-center justify-between',
        'select-none',
        colorClass,
        isSending && 'cursor-default'
      )}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      {/* Username + badge */}
      <div className="flex items-center gap-2 flex-1 justify-center">
        <span
          className={cn(
            'transition-all duration-200',
            showAhoy ? 'scale-110' : 'scale-100'
          )}
        >
          {showAhoy ? phrase.toUpperCase() : displayName}
        </span>
        {!showAhoy && badge && (
          <div className={cn(
            'px-2 py-1 rounded-full text-sm font-bold',
            'flex items-center gap-1',
            'text-white',
            badge.color
          )}>
            <span>{badge.icon}</span>
            <span className="text-xs hidden sm:inline">{badge.label}</span>
          </div>
        )}
      </div>

      {/* Per-friend ahoy counter */}
      {!showAhoy && (
        <div className="flex items-center gap-1 bg-black/20 rounded-full px-2 py-1 ml-2 shrink-0">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white/70">
            <path d="M12 2C10.9 2 10 2.9 10 4C10 4.74 10.4 5.39 11 5.73V7H6C5.45 7 5 7.45 5 8V9H7V8H11V11H8C7.45 11 7 11.45 7 12V13H9V12H11V20.27C9.68 19.85 8.54 19 7.68 17.88C7.23 17.32 6.45 17.23 5.89 17.68C5.33 18.13 5.24 18.91 5.69 19.47C7.03 21.17 8.89 22.35 11 22.8V23H13V22.8C15.11 22.35 16.97 21.17 18.31 19.47C18.76 18.91 18.67 18.13 18.11 17.68C17.55 17.23 16.77 17.32 16.32 17.88C15.46 19 14.32 19.85 13 20.27V12H15V13H17V12C17 11.45 16.55 11 16 11H13V8H17V9H19V8C19 7.45 18.55 7 18 7H13V5.73C13.6 5.39 14 4.74 14 4C14 2.9 13.1 2 12 2Z"/>
          </svg>
          <span className="text-white/70 text-xs font-bold">{myAhoysToThem}</span>
        </div>
      )}
    </button>
  )
}
