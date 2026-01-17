'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FriendCard } from './friend-card'
import { setupMessageListener } from '@/lib/firebase/notifications'
import { playShipBell, unlockAudio } from '@/lib/sounds/ship-bell'
import type { User } from '@/lib/supabase/types'

interface FriendListProps {
  initialFriends: User[]
  currentUserId: string
  username: string
}

export function FriendList({ initialFriends, currentUserId, username }: FriendListProps) {
  const [friends, setFriends] = useState<User[]>(initialFriends)
  const [menuOpen, setMenuOpen] = useState(false)
  const [ahoyReceived, setAhoyReceived] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Unlock audio on first user interaction
  useEffect(() => {
    const handleInteraction = () => {
      unlockAudio()
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('touchstart', handleInteraction)
    }

    document.addEventListener('click', handleInteraction)
    document.addEventListener('touchstart', handleInteraction)

    return () => {
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('touchstart', handleInteraction)
    }
  }, [])

  // Listen for incoming Ahoy messages and play sound
  useEffect(() => {
    const unsubscribe = setupMessageListener((payload) => {
      console.log('Received Ahoy in foreground:', payload)
      const senderName = (payload as { notification?: { title?: string } })?.notification?.title || 'AHOY!'
      setAhoyReceived(senderName)
      setTimeout(() => setAhoyReceived(null), 3000)
      unlockAudio()
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
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)

    if (!friendships || friendships.length === 0) {
      return { data: [] }
    }

    const friendIds = friendships.map((f) =>
      f.requester_id === currentUserId ? f.addressee_id : f.requester_id
    )

    const { data: users } = await supabase
      .from('users')
      .select('*')
      .in('id', friendIds)

    return { data: users || [] }
  }

  const handleAhoy = async (friendId: string) => {
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

    await fetch('/api/ahoys/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverId: friendId }),
    })
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/search?add=${username}`

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Add me on Ahoy!',
          text: `Add me on Ahoy! My username is ${username}`,
          url: shareUrl,
        })
      } catch (err) {
        console.log('Share cancelled')
      }
    } else {
      await navigator.clipboard.writeText(shareUrl)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
    setMenuOpen(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Ahoy received toast */}
      {ahoyReceived && (
        <div className="fixed top-20 left-4 right-4 z-50 animate-pulse">
          <div className="bg-yellow-400 text-gray-900 p-4 rounded-lg shadow-xl text-center font-bold text-xl uppercase"
               style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            {ahoyReceived}
          </div>
        </div>
      )}

      {/* Copy success toast */}
      {copySuccess && (
        <div className="fixed top-20 left-4 right-4 z-50">
          <div className="bg-green-500 text-white p-3 rounded-lg shadow-xl text-center font-bold uppercase"
               style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Link Copied!
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <h1
            className="text-white text-xl font-bold uppercase tracking-wide"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
          >
            Crew Manifest
          </h1>

          {/* Ship menu button */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              {/* Ship icon */}
              <svg
                viewBox="0 0 24 24"
                fill="white"
                className="w-7 h-7"
              >
                <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z"/>
              </svg>
            </button>

            {/* Dropdown menu */}
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                <button
                  onClick={() => {
                    router.push('/search')
                    setMenuOpen(false)
                  }}
                  className="w-full px-4 py-3 text-left text-white hover:bg-gray-700 flex items-center gap-3 transition-colors"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                  Search
                </button>
                <button
                  onClick={handleShare}
                  className="w-full px-4 py-3 text-left text-white hover:bg-gray-700 flex items-center gap-3 transition-colors"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                  </svg>
                  Share
                </button>
                <button
                  onClick={() => {
                    router.push('/requests')
                    setMenuOpen(false)
                  }}
                  className="w-full px-4 py-3 text-left text-white hover:bg-gray-700 flex items-center gap-3 transition-colors"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/>
                  </svg>
                  Requests
                </button>
                <button
                  onClick={() => {
                    router.push('/settings')
                    setMenuOpen(false)
                  }}
                  className="w-full px-4 py-3 text-left text-white hover:bg-gray-700 flex items-center gap-3 transition-colors"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                  </svg>
                  Settings
                </button>
                <div className="border-t border-gray-700" />
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 text-left text-red-400 hover:bg-gray-700 flex items-center gap-3 transition-colors"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
                  </svg>
                  Log Off
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Friends list */}
      <div className="flex-1 overflow-y-auto">
        {friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="text-gray-500 mb-4">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 mx-auto mb-4">
                <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z"/>
              </svg>
            </div>
            <h3
              className="text-xl font-bold text-gray-400 mb-2 uppercase"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              No Crew Yet
            </h3>
            <p
              className="text-gray-500 mb-6"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              Search for friends to add to your crew
            </p>
            <button
              onClick={() => router.push('/search')}
              className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-lg font-bold uppercase"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              Find Friends
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {friends.map((friend, index) => (
              <FriendCard
                key={friend.id}
                friend={friend}
                onAhoy={handleAhoy}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
