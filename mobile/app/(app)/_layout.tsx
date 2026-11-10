import { Stack } from 'expo-router'

import { useUserId } from '@/lib/auth'
import { useFriendshipRealtime } from '@/lib/realtime'
import { colors, type } from '@/theme'

export default function AppLayout() {
  const userId = useUserId()
  useFriendshipRealtime(userId)

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.accent,
        headerTitleStyle: { fontFamily: type.heading.fontFamily, fontWeight: type.heading.fontWeight },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Crew' }} />
      <Stack.Screen name="search" options={{ title: 'Find Friends' }} />
      <Stack.Screen name="requests" options={{ title: 'Requests' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  )
}
