import { createClient } from '@/lib/supabase/server'
import { FriendList } from '@/components/friends/friend-list'
import type { UserWithAhoyCount } from '@/lib/supabase/types'

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

  // Get ahoy counts for all friends
  let ahoyCountMap: Record<string, number> = {}
  if (friendIds.length > 0) {
    const { data: ahoyData } = await supabase
      .from('ahoys')
      .select('sender_id')
      .in('sender_id', friendIds)

    if (ahoyData) {
      ahoyData.forEach((a) => {
        ahoyCountMap[a.sender_id] = (ahoyCountMap[a.sender_id] || 0) + 1
      })
    }
  }

  // Get how many ahoys current user has sent to each specific friend
  let myAhoysMap: Record<string, number> = {}
  if (friendIds.length > 0) {
    const { data: myAhoyData } = await supabase
      .from('ahoys')
      .select('receiver_id')
      .eq('sender_id', user.id)
      .in('receiver_id', friendIds)

    if (myAhoyData) {
      myAhoyData.forEach((a) => {
        myAhoysMap[a.receiver_id] = (myAhoysMap[a.receiver_id] || 0) + 1
      })
    }
  }

  // Attach ahoy counts to friends
  const friendsWithCounts: UserWithAhoyCount[] = (friends || []).map((f) => ({
    ...f,
    ahoyCount: ahoyCountMap[f.id] || 0,
    myAhoysToThem: myAhoysMap[f.id] || 0,
  }))

  // Get current user's own ahoy count (for header counter + phrase unlock)
  const { data: userAhoyCount } = await supabase
    .rpc('get_ahoy_count', { user_id: user.id })

  return (
    <FriendList
      initialFriends={friendsWithCounts}
      currentUserId={user.id}
      username={profile?.username || ''}
      userAhoyCount={(userAhoyCount as number) || 0}
    />
  )
}
