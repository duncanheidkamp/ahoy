import { router, Stack } from 'expo-router'
import { useEffect } from 'react'

import { PhraseCelebrationHost } from '@/components/phrase-celebration'
import { useUserId } from '@/lib/auth'
import { kv } from '@/lib/kv'
import { createPendingInvites } from '@/lib/links'
import { usePushSession } from '@/lib/push/use-push'
import { useFriendshipRealtime } from '@/lib/realtime'
import { type, useTheme } from '@/theme'

const pendingInvites = createPendingInvites(kv)

/** An invite link opened while signed out / before picking a username. */
function useResumePendingInvite() {
  useEffect(() => {
    let cancelled = false
    pendingInvites
      .take()
      .then((username) => {
        if (username && !cancelled) router.push({ pathname: '/add/[username]', params: { username } })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
}

export default function AppLayout() {
  const { colors } = useTheme()
  const userId = useUserId()
  useFriendshipRealtime(userId)
  usePushSession(userId)
  useResumePendingInvite()

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.accent,
          headerTitleStyle: { fontFamily: type.navTitle.fontFamily, fontSize: type.navTitle.fontSize },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Crew' }} />
        <Stack.Screen name="search" options={{ title: 'Find friends' }} />
        <Stack.Screen name="requests" options={{ title: 'Requests' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="report" options={{ title: 'Report', presentation: 'modal' }} />
        <Stack.Screen name="delete-account" options={{ title: 'Delete account', presentation: 'modal' }} />
        <Stack.Screen name="enable-notifications" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      <PhraseCelebrationHost userId={userId} />
    </>
  )
}
