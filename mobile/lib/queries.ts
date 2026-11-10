// TanStack Query hooks over the Phase 1 RPCs and tables. Everything goes
// through RLS or security-definer functions — never select('*') on users.

import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { classifySendError, type SendFailure } from './send-machine'
import { supabase } from './supabase'
import type { MyStats, User } from './types'

export const queryKeys = {
  profile: ['profile'] as const,
  stats: ['stats'] as const,
  friendBadges: ['friendBadges'] as const,
  requests: ['requests'] as const,
  phrases: ['phrases'] as const,
  search: (q: string) => ['search', q] as const,
  usernameAvailable: (name: string) => ['usernameAvailable', name] as const,
}

/** Everything that depends on the friendships table. */
export function invalidateCrew(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.friendBadges }),
    qc.invalidateQueries({ queryKey: queryKeys.stats }),
    qc.invalidateQueries({ queryKey: queryKeys.requests }),
  ])
}

// ---------------------------------------------------------------------------
// Profile & phrases

export interface Profile {
  id: string
  username: string
  activePhraseId: number
  activePhrase: string
}

export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.rpc('get_my_profile')
      if (error) throw error
      const row = data?.[0]
      if (!row) return null
      return {
        id: row.id,
        username: row.username,
        activePhraseId: row.active_phrase_id,
        activePhrase: row.active_phrase,
      }
    },
  })
}

export function usePhrases() {
  return useQuery({
    queryKey: queryKeys.phrases,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_phrases')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useSetActivePhrase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (phraseId: number) => {
      const { error } = await supabase.rpc('set_active_phrase', { phrase_id: phraseId })
      if (error) throw error
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.phrases }),
        qc.invalidateQueries({ queryKey: queryKeys.profile }),
      ]),
  })
}

// ---------------------------------------------------------------------------
// Crew (accepted friends + counts)

export interface CrewMember {
  id: string
  username: string
  /** Friend's lifetime total sent (drives their badge). */
  totalSent: number
  /** How many ahoys I have sent this friend. */
  sentByMe: number
}

function parseStats(raw: unknown): MyStats {
  const obj = (raw ?? {}) as Partial<MyStats>
  return {
    total_sent: Number(obj.total_sent ?? 0),
    per_friend: obj.per_friend ?? {},
  }
}

export function useMyStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: async (): Promise<MyStats> => {
      const { data, error } = await supabase.rpc('get_my_stats')
      if (error) throw error
      return parseStats(data)
    },
  })
}

export function useFriendBadges() {
  return useQuery({
    queryKey: queryKeys.friendBadges,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_friend_badges')
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Crew list = get_friend_badges() joined with get_my_stats().per_friend.
 * The two queries are cached separately and refetches keep the previous data
 * until the new data arrives, so a realtime invalidation never blanks counts
 * (the PWA replaced its list with count-less rows on every friendship change).
 */
export function useCrew() {
  const badges = useFriendBadges()
  const stats = useMyStats()
  const crew = useMemo<CrewMember[]>(() => {
    const perFriend = stats.data?.per_friend ?? {}
    return (badges.data ?? []).map((b) => ({
      id: b.friend_id,
      username: b.username,
      totalSent: Number(b.total_sent ?? 0),
      sentByMe: Number(perFriend[b.friend_id] ?? 0),
    }))
  }, [badges.data, stats.data])

  return {
    crew,
    totalSent: stats.data?.total_sent ?? 0,
    isLoading: badges.isLoading || stats.isLoading,
    isError: badges.isError || stats.isError,
    isRefetching: badges.isRefetching || stats.isRefetching,
    refetch: () => Promise.all([badges.refetch(), stats.refetch()]),
  }
}

// ---------------------------------------------------------------------------
// Sending

export class SendAhoyError extends Error {
  constructor(public failure: SendFailure) {
    super(failure)
    this.name = 'SendAhoyError'
  }
}

async function failureFromInvokeError(error: unknown): Promise<SendFailure> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response | undefined
    let code: string | null = null
    try {
      const body = (await response?.clone().json()) as { error?: unknown } | undefined
      code = typeof body?.error === 'string' ? body.error : null
    } catch {
      // Non-JSON body; fall back to the status code.
    }
    return classifySendError({ status: response?.status ?? 0, code })
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return classifySendError({ status: null })
  }
  return 'unknown'
}

/** Calls the send-ahoy Edge Function. Resolves with the phrase the server used. */
export async function sendAhoy(receiverId: string): Promise<{ phrase: string | null }> {
  let result
  try {
    result = await supabase.functions.invoke<{ ok: boolean; phrase?: string }>('send-ahoy', {
      body: { receiver_id: receiverId },
    })
  } catch (e) {
    throw new SendAhoyError(await failureFromInvokeError(e))
  }
  if (result.error) throw new SendAhoyError(await failureFromInvokeError(result.error))
  return { phrase: result.data?.phrase ?? null }
}

/** After a successful send, bump the cached counts without a refetch. */
export function recordSentInCache(qc: QueryClient, receiverId: string) {
  qc.setQueryData<MyStats>(queryKeys.stats, (prev) => {
    const base = prev ?? { total_sent: 0, per_friend: {} }
    return {
      total_sent: base.total_sent + 1,
      per_friend: { ...base.per_friend, [receiverId]: (base.per_friend[receiverId] ?? 0) + 1 },
    }
  })
  // The receiver's lifetime total is unchanged (it counts what *they* sent),
  // but my total can unlock phrases, so refresh the picker lazily.
  qc.invalidateQueries({ queryKey: queryKeys.phrases, refetchType: 'none' })
}

// ---------------------------------------------------------------------------
// Requests

export interface FriendRequestRow {
  id: string
  createdAt: string
  other: User
}

type RequestQueryRow = {
  id: string
  created_at: string
  requester: User | null
  addressee: User | null
}

const REQUEST_SELECT =
  'id, created_at, requester:users!friendships_requester_id_fkey(id, username, created_at), addressee:users!friendships_addressee_id_fkey(id, username, created_at)'

export function useRequests(userId: string) {
  return useQuery({
    queryKey: queryKeys.requests,
    queryFn: async () => {
      const [incoming, outgoing] = await Promise.all([
        supabase
          .from('friendships')
          .select(REQUEST_SELECT)
          .eq('addressee_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('friendships')
          .select(REQUEST_SELECT)
          .eq('requester_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ])
      if (incoming.error) throw incoming.error
      if (outgoing.error) throw outgoing.error
      const map = (rows: unknown, side: 'requester' | 'addressee'): FriendRequestRow[] =>
        ((rows ?? []) as RequestQueryRow[])
          .filter((r) => r[side])
          .map((r) => ({ id: r.id, createdAt: r.created_at, other: r[side]! }))
      return {
        incoming: map(incoming.data, 'requester'),
        outgoing: map(outgoing.data, 'addressee'),
      }
    },
  })
}

function useFriendshipMutation<T>(fn: (arg: T) => PromiseLike<{ error: unknown }>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (arg: T) => {
      const { error } = await fn(arg)
      if (error) throw error
    },
    onSettled: () => invalidateCrew(qc),
  })
}

export function useAcceptRequest() {
  return useFriendshipMutation((id: string) =>
    supabase.from('friendships').update({ status: 'accepted' }).eq('id', id)
  )
}

export function useDeclineRequest() {
  return useFriendshipMutation((id: string) =>
    supabase.from('friendships').update({ status: 'declined' }).eq('id', id)
  )
}

export function useCancelRequest() {
  return useFriendshipMutation((id: string) => supabase.from('friendships').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Search & add

export function useSearchUsers(query: string) {
  const q = query.trim().toLowerCase()
  return useQuery({
    queryKey: queryKeys.search(q),
    enabled: q.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_users', { p_query: q })
      if (error) throw error
      return data ?? []
    },
  })
}

export type AddResult = 'requested' | 'crew'

/**
 * Same logic as the PWA's app/search/page.tsx on the Phase 1 branch. The
 * database lets the requester create only 'pending' rows and only the
 * addressee accept, so:
 *   - no existing row            -> insert pending           -> requested
 *   - they already asked me      -> accept their request     -> crew
 *   - I asked (pending/declined) -> nothing to do            -> requested
 *   - already accepted           -> nothing to do            -> crew
 */
export async function addFriend(myId: string, otherId: string): Promise<AddResult> {
  const { data: existing, error: lookupError } = await supabase
    .from('friendships')
    .select('id, status, requester_id')
    .or(
      `and(requester_id.eq.${myId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${myId})`
    )
    .maybeSingle()
  if (lookupError) throw lookupError

  if (existing) {
    if (existing.status === 'accepted') return 'crew'
    if (existing.requester_id === otherId) {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', existing.id)
      if (error) throw error
      return 'crew'
    }
    return 'requested'
  }

  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: myId, addressee_id: otherId, status: 'pending' })
  if (error) throw error
  return 'requested'
}

export function useAddFriend(myId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (otherId: string) => addFriend(myId, otherId),
    onSettled: () => invalidateCrew(qc),
  })
}

// ---------------------------------------------------------------------------
// Sign-up helpers (anon)

export function useUsernameAvailable(username: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.usernameAvailable(username),
    enabled,
    staleTime: 10_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('username_available', { p_username: username })
      if (error) throw error
      return data === true
    },
  })
}
