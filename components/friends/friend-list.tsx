'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FriendCard } from './friend-card'
import { setupMessageListener } from '@/lib/firebase/notifications'
import { playShipBell } from '@/lib/sounds/ship-bell'
import type { User } from '@/lib/supabase/types'

interface FriendListProps {
  initialFriends: User[]
  currentUserId: string
}

export function FriendList({ initialFriends, currentUserId }: FriendListProps) {
  const [friends, setFriends] = useState<User[]>(initialFriends)
  const supabase = createClient()

  // Listen for incoming Ahoy messages and play sound
  useEffect(() => {
    const unsubscribe = setupMessageListener((payload) => {
      console.log('Received Ahoy in foreground:', payload)
      playShipBell()
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  // Subscribe to real-time friendship changes
  useEffect(() => {
    const channel = supabase
      .channel('friendships')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
        },
        async () => {
          // Refresh friends list
          const { data } = await fetchFriends()
          if (data) setFriends(data)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchFriends = async () => {
    // Get all accepted friendships where user is either requester or addressee
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)

    if (!friendships || friendships.length === 0) {
      return { data: [] }
    }

    // Extract friend IDs
    const friendIds = friendships.map((f) =>
      f.requester_id === currentUserId ? f.addressee_id : f.requester_id
    )

    // Get friend profiles
    const { data: users } = await supabase
      .from('users')
      .select('*')
      .in('id', friendIds)

    return { data: users || [] }
  }

  const handleAhoy = async (friendId: string) => {
    // Record the ahoy
    const { error: ahoyError } = await supabase
      .from('ahoys')
      .insert({
        sender_id: currentUserId,
        receiver_id: friendId,
        phrase: 'Ahoy!',
      })

    if (ahoyError) {
      throw ahoyError
    }

    // Send push notification via API
    await fetch('/api/ahoys/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverId: friendId }),
    })
  }

  if (friends.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="w-20 h-20 mx-auto mb-4 text-amber-300">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C10.9 2 10 2.9 10 4C10 4.74 10.4 5.39 11 5.73V7H6C5.45 7 5 7.45 5 8V9H7V8H11V11H8C7.45 11 7 11.45 7 12V13H9V12H11V20.27C9.68 19.85 8.54 19 7.68 17.88C7.23 17.32 6.45 17.23 5.89 17.68C5.33 18.13 5.24 18.91 5.69 19.47C7.03 21.17 8.89 22.35 11 22.8V23H13V22.8C15.11 22.35 16.97 21.17 18.31 19.47C18.76 18.91 18.67 18.13 18.11 17.68C17.55 17.23 16.77 17.32 16.32 17.88C15.46 19 14.32 19.85 13 20.27V12H15V13H17V12C17 11.45 16.55 11 16 11H13V8H17V9H19V8C19 7.45 18.55 7 18 7H13V5.73C13.6 5.39 14 4.74 14 4C14 2.9 13.1 2 12 2Z"/>
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-amber-800 mb-2">No crew members yet</h3>
        <p className="text-amber-600 text-sm">
          Search for friends to add to your crew and start sending Ahoys!
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 text-amber-600">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z"/>
            <path d="M7 7H9V9H7V7ZM7 11H9V13H7V11ZM7 15H9V17H7V15ZM11 7H17V9H11V7ZM11 11H17V13H11V11ZM11 15H17V17H11V15Z"/>
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">
          Crew Manifest ({friends.length})
        </h2>
      </div>

      {friends.map((friend) => (
        <FriendCard
          key={friend.id}
          friend={friend}
          onAhoy={handleAhoy}
        />
      ))}
    </div>
  )
}
