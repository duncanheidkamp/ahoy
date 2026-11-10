import { Link } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { FormScreen } from '@/components/screen'
import { SocialAuthSlot } from '@/components/social-auth-slot'
import { Button, TextField } from '@/components/ui'
import { useUsernameAvailable } from '@/lib/queries'
import { useDebounced } from '@/lib/use-debounced'
import { supabase } from '@/lib/supabase'
import { normalizeUsername, USERNAME_MAX, validateUsername } from '@/lib/username'
import { colors, minTouch, spacing, type } from '@/theme'

const MIN_PASSWORD = 6 // Supabase Auth default minimum


export default function SignUpScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  const validation = validateUsername(username)
  const debouncedUsername = useDebounced(username, 350)
  const availability = useUsernameAvailable(
    debouncedUsername,
    validation.valid && debouncedUsername === username
  )
  const settled = debouncedUsername === username && !availability.isFetching
  const available = settled && availability.data === true

  const canSubmit = email.includes('@') && password.length >= MIN_PASSWORD && validation.valid && available

  let usernameHint: ReactNode = null
  if (username.length > 0 && !validation.valid) {
    usernameHint = <Text style={styles.bad}>{validation.error}</Text>
  } else if (validation.valid && !settled) {
    usernameHint = (
      <View style={styles.hintRow}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.muted}>Checking…</Text>
      </View>
    )
  } else if (validation.valid && availability.isError) {
    usernameHint = <Text style={styles.bad}>Couldn&apos;t check — are you online?</Text>
  } else if (validation.valid && availability.data === false) {
    usernameHint = <Text style={styles.bad}>@{username} is taken</Text>
  } else if (available) {
    usernameHint = <Text style={styles.good}>@{username} is available</Text>
  }

  const onSubmit = async () => {
    if (!canSubmit) return
    setError(null)
    setBusy(true)
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // The on_auth_user_created trigger creates public.users from this.
      options: { data: { username } },
    })
    setBusy(false)
    if (authError) {
      const msg = authError.message.toLowerCase()
      if (msg.includes('database error')) {
        // The trigger rejected the username (taken in the meantime / invalid).
        setError('That username was just taken — pick another')
        void availability.refetch()
      } else if (msg.includes('already registered')) {
        setError('That email already has an account — log in instead')
      } else if (msg.includes('password')) {
        setError(authError.message)
      } else {
        setError('Sign up failed — try again')
      }
      return
    }
    // With email confirmation on, there is no session yet.
    if (!data.session) setCheckEmail(true)
    // Otherwise the auth gate swaps to the crew screen.
  }

  if (checkEmail) {
    return (
      <FormScreen>
        <Text accessibilityRole="header" style={styles.title}>
          Check your email
        </Text>
        <Text style={styles.subtitle}>
          We sent a confirmation link to {email.trim()}. Confirm it, then log in.
        </Text>
        <Link href="/log-in" replace style={styles.link} accessibilityRole="link">
          Back to log in
        </Link>
      </FormScreen>
    )
  }

  return (
    <FormScreen>
      <Text accessibilityRole="header" style={styles.title}>
        Join the crew
      </Text>

      {/* PHASE 4: Sign in with Apple / Google buttons render here. */}
      <SocialAuthSlot />

      <TextField
        label="Username"
        value={username}
        onChangeText={(t) => setUsername(normalizeUsername(t))}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username-new"
        textContentType="username"
        maxLength={USERNAME_MAX}
        hint={usernameHint}
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={
          password.length > 0 && password.length < MIN_PASSWORD ? (
            <Text style={styles.muted}>At least {MIN_PASSWORD} characters</Text>
          ) : null
        }
      />

      {error && (
        <Text accessibilityLiveRegion="polite" style={styles.bad}>
          {error}
        </Text>
      )}

      <Button title="Sign up" onPress={onSubmit} loading={busy} disabled={!canSubmit} />

      <View style={styles.footer}>
        <Text style={styles.muted}>Already aboard?</Text>
        <Link href="/log-in" replace style={styles.link} accessibilityRole="link">
          Log in
        </Link>
      </View>
    </FormScreen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.accent, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { ...type.small, color: colors.textMuted },
  good: { ...type.small, color: colors.success },
  bad: { ...type.small, color: colors.dangerText },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  link: { ...type.bodyBold, color: colors.primary, minHeight: minTouch, paddingVertical: spacing.md },
})
