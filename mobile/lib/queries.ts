// TanStack Query hooks over the Phase 1 RPCs and tables. Everything goes
// through RLS or security-definer functions — never select('*') on users.

import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import * as Crypto from 'expo-crypto'

import { createHiddenRequests } from './hidden-requests'
import { kv } from './kv'
import { classifySendError, type SendFailure } from './send-machine'
import { supabase } from './supabase'
import type { MyStats, User, UserCard } from './types'

export const queryKeys = {
  profile: ['profile'] as const,
  stats: ['stats'] as const,
  friendBadges: ['friendBadges'] as const,
  requests: ['requests'] as const,
  phrases: ['phrases'] as const,
  search: (q: string) => ['search', q] as const,
  userCard: (username: string) => ['userCard', username] as const,
  blocks: ['blocks'] as const,
  usernameAvailable: (name: string) => ['usernameAvailable', name] as const,
}

/** Everything that depends on the friendships table. */
export function invalidateCrew(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.friendBadges }),
    qc.invalidateQueries({ queryKey: queryKeys.stats }),
    qc.invalidateQueries({ queryKey: queryKeys.requests }),
    qc.invalidateQueries({ queryKey: ['userCard'] }),
  ])
}

// ---------------------------------------------------------------------------
// Profile & phrases

export interface Profile {
  id: string
  /** null for a social-login account that hasn't claimed a username yet */
  username: string | null
  activePhraseId: number
  activePhrase: string
}

export function useProfile({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.profile,
    enabled,
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
// Friend-request pushes

/**
 * Asks the server to push "@me wants to join your crew" (after creating a
 * request) or "@me joined your crew" (after accepting one). Fire and forget:
 * the server decides from the row's current state whether a push is due and
 * makes repeats no-ops (notify-friendship Edge Function).
 */
export function notifyFriendship(friendshipId: string): void {
  supabase.functions
    .invoke('notify-friendship', { body: { friendship_id: friendshipId } })
    .catch(() => {})
}

// ---------------------------------------------------------------------------
// Requests

export interface FriendRequestRow {
  id: string
  createdAt: string
  other: User
  /**
   * Outgoing only: the other side declined. NEVER shown — it still reads
   * "Request sent"; it only changes what Cancel does (hide locally, since the
   * requester can't delete a declined row).
   */
  declined: boolean
}

type RequestQueryRow = {
  id: string
  created_at: string
  status: 'pending' | 'accepted' | 'declined'
  requester: User | null
  addressee: User | null
}

const REQUEST_SELECT =
  'id, created_at, status, requester:users!friendships_requester_id_fkey(id, username, created_at), addressee:users!friendships_addressee_id_fkey(id, username, created_at)'

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
        // Declined requests stay listed as "Request sent" (never reveal a decline).
        supabase
          .from('friendships')
          .select(REQUEST_SELECT)
          .eq('requester_id', userId)
          .in('status', ['pending', 'declined'])
          .order('created_at', { ascending: false }),
      ])
      if (incoming.error) throw incoming.error
      if (outgoing.error) throw outgoing.error
      const hidden = new Set(await createHiddenRequests(kv, userId).get())
      const map = (rows: unknown, side: 'requester' | 'addressee'): FriendRequestRow[] =>
        ((rows ?? []) as RequestQueryRow[])
          .filter((r) => r[side] && !hidden.has(r.id))
          .map((r) => ({ id: r.id, createdAt: r.created_at, other: r[side]!, declined: r.status === 'declined' }))
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
  return useFriendshipMutation(async (id: string) => {
    const result = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', id)
    if (!result.error) notifyFriendship(id)
    return result
  })
}

export function useDeclineRequest() {
  return useFriendshipMutation((id: string) =>
    supabase.from('friendships').update({ status: 'declined' }).eq('id', id)
  )
}

export function useCancelRequest(userId: string) {
  return useFriendshipMutation(async (request: FriendRequestRow) => {
    if (request.declined) {
      await createHiddenRequests(kv, userId).hide(request.id)
      return { error: null }
    }
    return supabase.from('friendships').delete().eq('id', request.id)
  })
}

// ---------------------------------------------------------------------------
// Remove, block, report

/** Remove a crewmate (either side may delete an accepted friendship). */
export function useRemoveFriend(myId: string) {
  return useFriendshipMutation((otherId: string) =>
    supabase
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${myId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${myId})`
      )
  )
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}

export async function blockUser(myId: string, otherId: string): Promise<void> {
  // The blocks_remove_friendship trigger deletes any friendship/request.
  const { error } = await supabase.from('blocks').insert({ blocker_id: myId, blocked_id: otherId })
  if (error && !isUniqueViolation(error)) throw error
}

export function useBlockUser(myId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (otherId: string) => blockUser(myId, otherId),
    onSettled: () => Promise.all([invalidateCrew(qc), qc.invalidateQueries({ queryKey: queryKeys.blocks })]),
  })
}

export interface BlockedUser {
  id: string
  username: string | null
  blockedAt: string
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: queryKeys.blocks,
    queryFn: async (): Promise<BlockedUser[]> => {
      const { data, error } = await supabase
        .from('blocks')
        .select('blocked_id, created_at, blocked:users!blocks_blocked_id_fkey(id, username)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as {
        blocked_id: string
        created_at: string
        blocked: { id: string; username: string | null } | null
      }[]).map((b) => ({ id: b.blocked_id, username: b.blocked?.username ?? null, blockedAt: b.created_at }))
    },
  })
}

export function useUnblockUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (otherId: string) => {
      const { error } = await supabase.from('blocks').delete().eq('blocked_id', otherId)
      if (error) throw error
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.blocks }),
        qc.invalidateQueries({ queryKey: ['userCard'] }),
        qc.invalidateQueries({ queryKey: ['search'] }),
      ]),
  })
}

/**
 * Files a report (insert-own; no select back, so the id is made here) and
 * asks notify-report to email it. The email is fire and forget — the report
 * is saved either way.
 */
export async function reportUser(reportedId: string, note: string | null): Promise<void> {
  const id = Crypto.randomUUID()
  const { error } = await supabase.from('reports').insert({ id, reported_id: reportedId, note })
  if (error) throw error
  supabase.functions.invoke('notify-report', { body: { report_id: id } }).catch(() => {})
}

// ---------------------------------------------------------------------------
// Invite links

/** get_user_card(): null = not found (or unavailable — deliberately the same). */
export function useUserCard(username: string | null) {
  return useQuery({
    queryKey: queryKeys.userCard(username ?? ''),
    enabled: !!username,
    queryFn: async (): Promise<UserCard | null> => {
      const { data, error } = await supabase.rpc('get_user_card', { p_username: username! })
      if (error) throw error
      return data?.[0] ?? null
    },
  })
}

// ---------------------------------------------------------------------------
// Username (social-login accounts)

export function useClaimUsername() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (username: string) => {
      const { data, error } = await supabase.rpc('claim_username', { p_username: username })
      if (error) throw error
      return data
    },
    onSuccess: (username) => {
      // Flip the route guard right away; refetch for the rest of the profile.
      qc.setQueryData<Profile | null>(queryKeys.profile, (prev) => (prev ? { ...prev, username } : prev))
      void qc.invalidateQueries({ queryKey: queryKeys.profile })
    },
    // e.g. already claimed on another device: reload and let the guard route.
    onError: () => void qc.invalidateQueries({ queryKey: queryKeys.profile }),
  })
}

// ---------------------------------------------------------------------------
// Feedback

export async function sendFeedback(userId: string, version: string, message: string): Promise<void> {
  // user_id from the session; RLS also forces it to equal auth.uid().
  const { error } = await supabase.from('feedback').insert({ user_id: userId, version, message })
  if (error) throw error
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
      notifyFriendship(existing.id)
      return 'crew'
    }
    return 'requested'
  }

  const { data: created, error } = await supabase
    .from('friendships')
    .insert({ requester_id: myId, addressee_id: otherId, status: 'pending' })
    .select('id')
    .single()
  if (error) throw error
  notifyFriendship(created.id)
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
