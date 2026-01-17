'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/lib/supabase/types'

export default function SettingsPage() {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [friends, setFriends] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadFriends()
  }, [])

  const loadFriends = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: friendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

      if (!friendships || friendships.length === 0) {
        setFriends([])
        return
      }

      const friendIds = friendships.map((f) =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      )

      const { data: users } = await supabase
        .from('users')
        .select('*')
        .in('id', friendIds)

      setFriends(users || [])
    } catch (error) {
      console.error('Failed to load friends:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveFriend = async (friendId: string) => {
    const confirmed = window.confirm('Remove this friend from your crew?')
    if (!confirmed) return

    setRemovingId(friendId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Delete the friendship (could be either direction)
      await supabase
        .from('friendships')
        .delete()
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${user.id})`)

      setFriends(prev => prev.filter(f => f.id !== friendId))
    } catch (error) {
      console.error('Failed to remove friend:', error)
    } finally {
      setRemovingId(null)
    }
  }

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
      {/* Manage Crew Section */}
      <div className="mb-8">
        <h2
          className="text-gray-400 text-sm font-bold uppercase tracking-wide mb-4"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          Manage Crew
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-gray-700 border-t-purple-500 rounded-full" />
          </div>
        ) : friends.length === 0 ? (
          <div
            className="text-center py-6 text-gray-500"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            No crew members yet
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((friend, index) => {
              const colors = ['bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500']
              const colorClass = colors[index % colors.length]
              const isRemoving = removingId === friend.id

              return (
                <div
                  key={friend.id}
                  className={`flex items-center justify-between p-4 ${colorClass} rounded-lg`}
                >
                  <span
                    className="text-white text-lg font-bold uppercase"
                    style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                  >
                    {friend.username}
                  </span>
                  <button
                    onClick={() => handleRemoveFriend(friend.id)}
                    disabled={isRemoving}
                    className="px-4 py-2 bg-white/20 text-white rounded font-bold uppercase text-sm hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                    style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                  >
                    {isRemoving ? '...' : 'Remove'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Logout Section */}
      <div className="mb-8">
        <h2
          className="text-gray-400 text-sm font-bold uppercase tracking-wide mb-4"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          Account
        </h2>
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full p-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
          </svg>
          {isLoggingOut ? 'Logging out...' : 'Log Off'}
        </button>
      </div>

      {/* About Section */}
      <div>
        <h2
          className="text-gray-400 text-sm font-bold uppercase tracking-wide mb-4"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          About
        </h2>
        <div
          className="text-gray-500 text-sm"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          <p>Ahoy! v0.2.0</p>
          <p className="text-xs mt-1">Send an Ahoy to your crew with one tap.</p>
        </div>
      </div>
    </div>
  )
}
