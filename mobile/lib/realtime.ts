import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { invalidateCrew } from './queries'
import { supabase } from './supabase'

/**
 * Keeps the crew and requests fresh while signed in. Two postgres_changes
 * subscriptions, each filtered to rows the user is part of. On any change we
 * only *invalidate* (refetch in the background); cached counts stay on screen
 * until fresh ones arrive.
 *
 * Caveat (Supabase Realtime): filtered subscriptions do not receive DELETE
 * events, so an unfriend/cancel by the other side shows up on the next
 * foreground refetch or pull-to-refresh rather than instantly.
 * Requires public.friendships in the supabase_realtime publication
 * (supabase/migrations/20261110190000_realtime_friendships.sql).
 */
export function useFriendshipRealtime(userId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    // Coalesce bursts (accept = one UPDATE seen by both filters for self-rows).
    const onChange = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void invalidateCrew(qc)
      }, 250)
    }

    const channel = supabase
      .channel(`friendships:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${userId}` },
        onChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${userId}` },
        onChange
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [qc, userId])
}
