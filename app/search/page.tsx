'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getBadge } from '@/lib/utils'
import type { UserWithAhoyCount } from '@/lib/supabase/types'

type AddState = 'requested' | 'crew'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserWithAhoyCount[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [addState, setAddState] = useState<Record<string, AddState>>({})
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // search_users returns only public columns plus each user's lifetime
      // sent count (SQL count(*), not capped by RLS or the 1000-row limit),
      // and hides anyone with a block in either direction.
      const { data, error } = await supabase.rpc('search_users', { p_query: query })

      if (error) throw error

      setResults(
        (data ?? []).map((u) => ({
          id: u.id,
          username: u.username,
          created_at: '',
          ahoyCount: u.total_sent,
        }))
      )
    } catch {
      setError('Search failed - check your connection')
    } finally {
      setIsSearching(false)
    }
  }

  const markAdded = (userId: string, state: AddState) =>
    setAddState((prev) => ({ ...prev, [userId]: state }))

  // Sends a pending friend request. The database only allows the requester to
  // create 'pending' rows and only the addressee to accept, so:
  //   - no existing row            -> insert pending           -> "Requested"
  //   - they already asked me      -> accept their request     -> "In Crew"
  //   - I asked (pending/declined) -> nothing to do            -> "Requested"
  //   - already accepted           -> nothing to do            -> "In Crew"
  const handleAddFriend = async (userId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: existing } = await supabase
        .from('friendships')
        .select('id, status, requester_id')
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
        .maybeSingle()

      if (existing) {
        if (existing.status === 'accepted') {
          markAdded(userId, 'crew')
          return
        }
        if (existing.requester_id === userId) {
          // They sent me a request (pending, or one I declined) — accept it.
          const { error } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', existing.id)
          if (error) throw error
          markAdded(userId, 'crew')
          return
        }
        // My own request is still out (or was declined — we don't say which).
        markAdded(userId, 'requested')
        return
      }

      const { error } = await supabase
        .from('friendships')
        .insert({
          requester_id: user.id,
          addressee_id: userId,
          status: 'pending',
        })

      if (error) throw error

      markAdded(userId, 'requested')
    } catch {
      setError('Something went wrong!')
    }
  }

  return (
    <div className="p-4">
      {/* Search input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search username..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold uppercase rounded-lg disabled:opacity-50"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          {isSearching ? '...' : 'Go'}
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm"
             style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
          {error}
        </div>
      )}

      {/* Results */}
      <div className="space-y-2">
        {results.map((user, index) => {
          const colors = [
            'bg-purple-500',
            'bg-blue-500',
            'bg-green-500',
            'bg-orange-500',
            'bg-pink-500',
            'bg-teal-500',
          ]
          const colorClass = colors[index % colors.length]
          const state = addState[user.id]
          const isDisabled = !!state
          const badge = getBadge(user.ahoyCount || 0)

          return (
            <div
              key={user.id}
              className={`flex items-center justify-between p-4 ${colorClass} rounded-lg`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-white text-lg font-bold uppercase"
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  {user.username}
                </span>
                {badge && (
                  <div className={`px-2 py-1 rounded-full text-sm font-bold flex items-center gap-1 text-white ${badge.color}`}>
                    <span>{badge.icon}</span>
                    <span className="text-xs hidden sm:inline">{badge.label}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => handleAddFriend(user.id)}
                disabled={isDisabled}
                className={`px-4 py-2 rounded font-bold uppercase text-sm ${
                  isDisabled
                    ? 'bg-white/20 text-white/60 cursor-default'
                    : 'bg-white text-gray-900 hover:bg-gray-100'
                }`}
                style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                {state === 'crew' ? 'In Crew' : state === 'requested' ? 'Requested' : 'Add'}
              </button>
            </div>
          )
        })}

        {results.length === 0 && query && !isSearching && (
          <div className="text-center py-12 text-gray-500"
               style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            No users found
          </div>
        )}

        {!query && (
          <div className="text-center py-12 text-gray-500"
               style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Search for users by username
          </div>
        )}
      </div>
    </div>
  )
}
