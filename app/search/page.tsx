'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { User } from '@/lib/supabase/types'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Search for users by username
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .ilike('username', `%${query.toLowerCase()}%`)
        .neq('id', user.id)
        .limit(20)

      if (error) throw error

      setResults(data || [])
    } catch {
      setError('Lost at sea - check your connection')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSendRequest = async (userId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if friendship already exists
      const { data: existing } = await supabase
        .from('friendships')
        .select('id')
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
        .single()

      if (existing) {
        setError('You already have a connection with this sailor!')
        return
      }

      // Create friend request
      const { error } = await supabase
        .from('friendships')
        .insert({
          requester_id: user.id,
          addressee_id: userId,
          status: 'pending',
        })

      if (error) throw error

      setSentRequests((prev) => new Set(prev).add(userId))
    } catch {
      setError('Arrr, something went wrong!')
    }
  }

  const copyInviteLink = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('users')
      .select('username')
      .eq('id', user.id)
      .single()

    const link = `${window.location.origin}/search?invite=${profile?.username}`
    await navigator.clipboard.writeText(link)
    alert('Invite link copied! Share it with your friends.')
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-6 h-6 text-amber-600">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">
          Find Sailors
        </h2>
      </div>

      <Card variant="parchment" className="mb-4">
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search by username..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} isLoading={isSearching}>
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button
        variant="ghost"
        className="w-full mb-4 text-sky-700"
        onClick={copyInviteLink}
      >
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>
        Copy invite link
      </Button>

      {error && (
        <div className="p-3 mb-4 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {results.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-3 p-3 bg-white rounded-xl border-2 border-amber-200"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-bold uppercase">
              {user.username.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-900">@{user.username}</p>
            </div>
            <Button
              size="sm"
              variant={sentRequests.has(user.id) ? 'ghost' : 'secondary'}
              disabled={sentRequests.has(user.id)}
              onClick={() => handleSendRequest(user.id)}
            >
              {sentRequests.has(user.id) ? 'Sent' : 'Add'}
            </Button>
          </div>
        ))}

        {results.length === 0 && query && !isSearching && (
          <div className="text-center py-8 text-amber-600">
            <p>That sailor couldn&apos;t be found</p>
          </div>
        )}
      </div>
    </div>
  )
}
