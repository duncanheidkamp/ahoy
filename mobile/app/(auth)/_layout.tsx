import { Stack } from 'expo-router'

import { useTheme } from '@/theme'

export const unstable_settings = {
  initialRouteName: 'log-in',
}

export default function AuthLayout() {
  const { colors } = useTheme()
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
