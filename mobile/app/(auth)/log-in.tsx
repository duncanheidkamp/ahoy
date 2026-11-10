import { Link } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { FormScreen } from '@/components/screen'
import { SocialAuthSlot } from '@/components/social-auth-slot'
import { Button, TextField } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { colors, minTouch, spacing, type } from '@/theme'

export default function LogInScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async () => {
    setError(null)
    setBusy(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    // On success the auth gate in app/_layout.tsx swaps to the crew screen.
    if (authError) {
      setError(
        authError.message.toLowerCase().includes('email not confirmed')
          ? 'Check your email to confirm your account first'
          : 'Wrong email or password'
      )
    }
  }

  return (
    <FormScreen>
      <Text accessibilityRole="header" style={styles.title}>
        Ahoy!
      </Text>
      <Text style={styles.subtitle}>Log in to hail your crew</Text>

      <SocialAuthSlot mode="log-in" />

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      {error && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}

      <Button title="Log in" onPress={onSubmit} loading={busy} disabled={!email || !password} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>New here?</Text>
        <Link href="/sign-up" replace style={styles.link} accessibilityRole="link">
          Sign up
        </Link>
      </View>
    </FormScreen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.accent, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  error: { ...type.body, color: colors.dangerText },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  footerText: { ...type.body, color: colors.textMuted },
  link: { ...type.bodyBold, color: colors.primary, minHeight: minTouch, paddingVertical: spacing.md },
})
