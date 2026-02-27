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
  const [ahoyCount, setAhoyCount] = useState<number>(0)
  const [arrrgEnabled, setArrrgEnabled] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Load phrase preference from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('ahoy_phrase')
    setArrrgEnabled(saved === 'Arrrggggg Matey!')
  }, [])

  const handleToggleArrrg = () => {
    const next = !arrrgEnabled
    setArrrgEnabled(next)
    const phrase = next ? 'Arrrggggg Matey!' : 'Ahoy!'
    localStorage.setItem('ahoy_phrase', phrase)
    // Notify other tabs/components
    window.dispatchEvent(new StorageEvent('storage', { key: 'ahoy_phrase', newValue: phrase }))
  }

  useEffect(() => {
    loadFriends()
  }, [])

  const loadFriends = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch ahoy count for current user
      const { data: ahoyCountData } = await supabase.rpc('get_ahoy_count', { user_id: user.id })
      setAhoyCount(ahoyCountData || 0)

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
      {/* Ahoy Count Ticker */}
      <div className="mb-8">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-8 border-2 border-cyan-600 shadow-lg">
          <div className="flex items-center justify-center gap-4 mb-4">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-cyan-400">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
            </svg>
            <div className="text-center flex-1">
              <div className="text-5xl font-bold text-cyan-400 mb-1">{ahoyCount}</div>
              <div className="text-sm font-bold uppercase tracking-widest text-gray-300">Ahoys Sent</div>
            </div>
          </div>
          <div className="text-xs text-gray-400 text-center mt-2">
            Keep sailing the digital seas! 🌊
          </div>
        </div>
      </div>

      {/* Arrrggggg Matey unlock toggle */}
      <div className="mb-8">
        <h2
          className="text-gray-400 text-sm font-bold uppercase tracking-wide mb-4"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          Phrase
        </h2>
        <div className={`rounded-lg p-4 border ${ahoyCount >= 500 ? 'bg-gray-800 border-amber-600' : 'bg-gray-800/50 border-gray-700 opacity-60'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{ahoyCount >= 500 ? '☠️' : '🔒'}</span>
              <div>
                <p
                  className="text-white font-bold uppercase"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  Arrrggggg Matey!
                </p>
                <p
                  className="text-gray-400 text-xs mt-0.5"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  {ahoyCount >= 500
                    ? 'Unlocked at 500 ahoys ⚓'
                    : `${500 - ahoyCount} more ahoys to unlock`}
                </p>
              </div>
            </div>
            {/* Toggle switch */}
            <button
              onClick={ahoyCount >= 500 ? handleToggleArrrg : undefined}
              disabled={ahoyCount < 500}
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                arrrgEnabled ? 'bg-amber-500' : 'bg-gray-600'
              } disabled:cursor-not-allowed`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  arrrgEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

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
          <p>Ahoy! v0.4.0</p>
          <p className="text-xs mt-1">Send an Ahoy to your crew with one tap.</p>
        </div>
      </div>
    </div>
  )
}
