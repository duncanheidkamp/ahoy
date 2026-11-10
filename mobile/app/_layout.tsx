import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { AppState, Platform, Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { InAppBannerHost } from '@/components/in-app-banner'
import { ToastProvider } from '@/components/toast'
import { Centered, MutedText } from '@/components/ui'
import { AuthProvider, useAuth } from '@/lib/auth'
import { isConfigured } from '@/lib/env'
import { usePushForeground } from '@/lib/push/use-push'
import { colors, type } from '@/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

// Refetch stale queries when the app comes back to the foreground. This also
// covers friendship DELETEs, which filtered Realtime subscriptions don't see.
focusManager.setEventListener((setFocused) => {
  if (Platform.OS === 'web') return undefined
  const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'))
  return () => sub.remove()
})

function RootNavigator() {
  const { session, loading } = useAuth()

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {})
  }, [loading])

  if (loading) return null

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  )
}

/** Foreground notifications -> in-app banner/sound; badge clearing. */
function PushForeground() {
  usePushForeground()
  return <InAppBannerHost />
}

function ConfigError() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
  }, [])
  return (
    <Centered>
      <Text style={[type.heading, { color: colors.accent }]}>Missing configuration</Text>
      <MutedText>
        Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env (see .env.example) and restart
        the dev server.
      </MutedText>
    </Centered>
  )
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 2 },
          mutations: { retry: 0 },
        },
      })
  )

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.background }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        {isConfigured ? (
          <AuthProvider>
            <ToastProvider>
              <RootNavigator />
              <PushForeground />
            </ToastProvider>
          </AuthProvider>
        ) : (
          <ConfigError />
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
