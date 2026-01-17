'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .ilike('username', `%${query.toLowerCase()}%`)
        .neq('id', user.id)
        .limit(20)

      if (error) throw error

      setResults(data || [])
    } catch {
      setError('Search failed - check your connection')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSendRequest = async (userId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: existing } = await supabase
        .from('friendships')
        .select('id')
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
        .single()

      if (existing) {
        setError('Already connected!')
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

      setSentRequests((prev) => new Set(prev).add(userId))
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
          const isSent = sentRequests.has(user.id)

          return (
            <div
              key={user.id}
              className={`flex items-center justify-between p-4 ${colorClass} rounded-lg`}
            >
              <span
                className="text-white text-lg font-bold uppercase"
                style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                {user.username}
              </span>
              <button
                onClick={() => handleSendRequest(user.id)}
                disabled={isSent}
                className={`px-4 py-2 rounded font-bold uppercase text-sm ${
                  isSent
                    ? 'bg-white/20 text-white/60 cursor-default'
                    : 'bg-white text-gray-900 hover:bg-gray-100'
                }`}
                style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                {isSent ? 'Sent' : 'Add'}
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
