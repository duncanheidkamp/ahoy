// Sign in with Apple (iOS) / Google buttons on the Log in and Sign up
// screens. A new social-login account has no username yet; the root layout
// routes it to "Pick your pirate name" (app/(onboarding)/pick-username.tsx).
// Which buttons show: lib/social-auth.ts availableProviders().

import { GoogleSigninButton } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import type { Provider, SocialResult } from '@/lib/social-auth'
import { appleSignIn, googleSignIn, socialProviders } from '@/lib/social-auth-native'
import { colors, minTouch, radii, spacing, type } from '@/theme'

export function SocialAuthSlot({ mode }: { mode: 'log-in' | 'sign-up' }) {
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [busy, setBusy] = useState<Provider | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    socialProviders()
      .then((p) => mounted && setProviders(p))
      .catch(() => mounted && setProviders([]))
    return () => {
      mounted = false
    }
  }, [])

  if (!providers || providers.length === 0) return null

  const run = async (provider: Provider, fn: () => Promise<SocialResult>) => {
    if (busy) return
    setError(null)
    setBusy(provider)
    const result = await fn()
    setBusy(null)
    // On success the root layout's auth gate takes over.
    if (result.status === 'error') setError(result.message)
  }

  return (
    <View style={styles.container}>
      {providers.includes('apple') && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === 'sign-up'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radii.md}
          style={styles.apple}
          onPress={() => run('apple', appleSignIn)}
        />
      )}
      {providers.includes('google') && (
        <GoogleSigninButton
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Light}
          disabled={!!busy}
          onPress={() => run('google', googleSignIn)}
          style={styles.google}
          accessibilityLabel={mode === 'sign-up' ? 'Sign up with Google' : 'Sign in with Google'}
        />
      )}
      {busy && <ActivityIndicator color={colors.accent} />}
      {error && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}
      <View style={styles.divider} importantForAccessibility="no-hide-descendants">
        <View style={styles.line} />
        <Text style={styles.or}>or with email</Text>
        <View style={styles.line} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  apple: { height: minTouch + 4, width: '100%' },
  google: { height: minTouch + 4, width: '100%' },
  error: { ...type.body, color: colors.dangerText, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  or: { ...type.small, color: colors.textMuted },
})
