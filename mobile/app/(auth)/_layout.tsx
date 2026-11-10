import { Stack } from 'expo-router'

import { colors } from '@/theme'

export const unstable_settings = {
  initialRouteName: 'log-in',
}

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="log-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  )
}
