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
}

export function FriendCard({ friend, onAhoy, index }: FriendCardProps) {
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

  return (
    <button
      onClick={handleAhoy}
      disabled={isSending}
      className={cn(
        'w-full py-6 px-4',
        'text-white text-2xl font-bold uppercase tracking-wider',
        'transition-all duration-150',
        'flex items-center justify-center gap-3',
        'select-none',
        colorClass,
        isSending && 'cursor-default'
      )}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <span
        className={cn(
          'transition-all duration-200',
          showAhoy ? 'scale-110' : 'scale-100'
        )}
      >
        {showAhoy ? 'AHOY!' : displayName}
      </span>
      {badge && (
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
    </button>
  )
}
