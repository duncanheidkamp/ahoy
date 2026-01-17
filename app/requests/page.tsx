'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Friendship } from '@/lib/supabase/types'

interface RequestWithUser extends Friendship {
  requester: User
  addressee: User
}

export default function RequestsPage() {
  const [incoming, setIncoming] = useState<RequestWithUser[]>([])
  const [outgoing, setOutgoing] = useState<RequestWithUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: incomingData } = await supabase
        .from('friendships')
        .select('*, requester:users!friendships_requester_id_fkey(*), addressee:users!friendships_addressee_id_fkey(*)')
        .eq('addressee_id', user.id)
        .eq('status', 'pending')

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

      setOutgoing((prev) => prev.filter((r) => r.id !== requestId))
    } catch (error) {
      console.error('Failed to cancel request:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-gray-700 border-t-purple-500 rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Incoming Requests */}
      <div className="mb-8">
        <h2
          className="text-gray-400 text-sm font-bold uppercase tracking-wide mb-4"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          Incoming ({incoming.length})
        </h2>

        {incoming.length === 0 ? (
          <div className="text-center py-6 text-gray-500"
               style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            No incoming requests
          </div>
        ) : (
          <div className="space-y-2">
            {incoming.map((request, index) => {
              const colors = ['bg-green-500', 'bg-teal-500', 'bg-blue-500', 'bg-purple-500']
              const colorClass = colors[index % colors.length]

              return (
                <div
                  key={request.id}
                  className={`flex items-center justify-between p-4 ${colorClass} rounded-lg`}
                >
                  <span
                    className="text-white text-lg font-bold uppercase"
                    style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                  >
                    {request.requester.username}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(request.id)}
                      className="px-4 py-2 bg-white text-gray-900 rounded font-bold uppercase text-sm hover:bg-gray-100"
                      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDecline(request.id)}
                      className="px-4 py-2 bg-white/20 text-white rounded font-bold uppercase text-sm hover:bg-white/30"
                      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Outgoing Requests */}
      <div>
        <h2
          className="text-gray-400 text-sm font-bold uppercase tracking-wide mb-4"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
        >
          Pending ({outgoing.length})
        </h2>

        {outgoing.length === 0 ? (
          <div className="text-center py-6 text-gray-500"
               style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
            No pending requests
          </div>
        ) : (
          <div className="space-y-2">
            {outgoing.map((request, index) => {
              const colors = ['bg-orange-500', 'bg-pink-500', 'bg-rose-500', 'bg-amber-500']
              const colorClass = colors[index % colors.length]

              return (
                <div
                  key={request.id}
                  className={`flex items-center justify-between p-4 ${colorClass} rounded-lg`}
                >
                  <span
                    className="text-white text-lg font-bold uppercase"
                    style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                  >
                    {request.addressee.username}
                  </span>
                  <button
                    onClick={() => handleCancel(request.id)}
                    className="px-4 py-2 bg-white/20 text-white rounded font-bold uppercase text-sm hover:bg-white/30"
                    style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                  >
                    Cancel
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
