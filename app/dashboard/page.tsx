import { createClient } from '@/lib/supabase/server'
import { FriendList } from '@/components/friends/friend-list'
import type { MyStats, UserWithAhoyCount } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Counts come from SQL count(*) RPCs scoped to the caller — never from
  // fetching ahoys rows (RLS hides other people's rows; PostgREST caps at 1000).
  const [{ data: profile }, { data: badges }, { data: stats }] = await Promise.all([
    supabase.rpc('get_my_profile').maybeSingle(),
    supabase.rpc('get_friend_badges'),
    supabase.rpc('get_my_stats'),
  ])

  const myStats = (stats as unknown as MyStats | null) ?? { total_sent: 0, per_friend: {} }

  const friendsWithCounts: UserWithAhoyCount[] = (badges ?? []).map((b) => ({
    id: b.friend_id,
    username: b.username,
    created_at: '',
    ahoyCount: b.total_sent,
    myAhoysToThem: myStats.per_friend[b.friend_id] ?? 0,
  }))

  return (
    <FriendList
      initialFriends={friendsWithCounts}
      currentUserId={user.id}
      username={profile?.username || ''}
      userAhoyCount={myStats.total_sent}
      activePhrase={profile?.active_phrase || 'Ahoy!'}
    />
  )
}
