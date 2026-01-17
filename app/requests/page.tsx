'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { User, Friendship } from '@/lib/supabase/types'

interface RequestWithUser extends Friendship {
  requester: User
  addressee: User
}

export default function RequestsPage() {
  const [incoming, setIncoming] = useState<RequestWithUser[]>([])
  const [outgoing, setOutgoing] = useState<RequestWithUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)

      // Get incoming requests
      const { data: incomingData } = await supabase
        .from('friendships')
        .select('*, requester:users!friendships_requester_id_fkey(*), addressee:users!friendships_addressee_id_fkey(*)')
        .eq('addressee_id', user.id)
        .eq('status', 'pending')

      // Get outgoing requests
      const { data: outgoingData } = await supabase
        .from('friendships')
        .select('*, requester:users!friendships_requester_id_fkey(*), addressee:users!friendships_addressee_id_fkey(*)')
        .eq('requester_id', user.id)
        .eq('status', 'pending')

      setIncoming((incomingData as unknown as RequestWithUser[]) || [])
      setOutgoing((outgoingData as unknown as RequestWithUser[]) || [])
    } catch (error) {
      console.error('Failed to load requests:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAccept = async (requestId: string) => {
    try {
      await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', requestId)

      // Remove from incoming list
      setIncoming((prev) => prev.filter((r) => r.id !== requestId))
    } catch (error) {
      console.error('Failed to accept request:', error)
    }
  }

  const handleDecline = async (requestId: string) => {
    try {
      await supabase
        .from('friendships')
        .update({ status: 'declined' })
        .eq('id', requestId)

      // Remove from incoming list
      setIncoming((prev) => prev.filter((r) => r.id !== requestId))
    } catch (error) {
      console.error('Failed to decline request:', error)
    }
  }

  const handleCancel = async (requestId: string) => {
    try {
      await supabase
        .from('friendships')
        .delete()
        .eq('id', requestId)

      // Remove from outgoing list
      setOutgoing((prev) => prev.filter((r) => r.id !== requestId))
    } catch (error) {
      console.error('Failed to cancel request:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-amber-300 border-t-amber-600 rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Incoming Requests */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 text-amber-600">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/>
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">
            Messages in Bottles ({incoming.length})
          </h2>
        </div>

        {incoming.length === 0 ? (
          <div className="text-center py-6 text-amber-600 text-sm">
            No incoming requests
          </div>
        ) : (
          <div className="space-y-3">
            {incoming.map((request) => (
              <div
                key={request.id}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border-2 border-amber-200"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white font-bold uppercase">
                  {request.requester.username.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-amber-900">@{request.requester.username}</p>
                  <p className="text-xs text-amber-600">wants to join your crew</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleAccept(request.id)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDecline(request.id)}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outgoing Requests */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 text-amber-600">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">
            Sent Requests ({outgoing.length})
          </h2>
        </div>

        {outgoing.length === 0 ? (
          <div className="text-center py-6 text-amber-600 text-sm">
            No pending requests
          </div>
        ) : (
          <div className="space-y-3">
            {outgoing.map((request) => (
              <div
                key={request.id}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border-2 border-amber-200"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-bold uppercase">
                  {request.addressee.username.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-amber-900">@{request.addressee.username}</p>
                  <p className="text-xs text-amber-600">pending...</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleCancel(request.id)}>
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
