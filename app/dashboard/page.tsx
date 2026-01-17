import { createClient } from '@/lib/supabase/server'
import { FriendList } from '@/components/friends/friend-list'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .single()

  // Get all accepted friendships
  const { data: friendships } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  // Extract friend IDs
  const friendIds = friendships?.map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  ) || []

  // Get friend profiles
  const { data: friends } = friendIds.length > 0
    ? await supabase
        .from('users')
        .select('*')
        .in('id', friendIds)
    : { data: [] }

  return (
    <FriendList
      initialFriends={friends || []}
      currentUserId={user.id}
      username={profile?.username || ''}
    />
  )
}
