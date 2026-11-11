import { Link } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'

import { FormScreen } from '@/components/screen'
import { SocialAuthSlot } from '@/components/social-auth-slot'
import { Button, TextField } from '@/components/ui'
import { UsernameField, useUsernameField } from '@/components/username-field'
import { supabase } from '@/lib/supabase'
import { createStyles, maxFontScale, minTouch, spacing, type } from '@/theme'

const MIN_PASSWORD = 6 // Supabase Auth default minimum

export default function SignUpScreen() {
  const styles = useStyles()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const usernameField = useUsernameField()
  const { username, available } = usernameField
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  const canSubmit = email.includes('@') && password.length >= MIN_PASSWORD && available

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
        usernameField.recheck()
      } else if (msg.includes('already registered')) {
        setError('That email already has an account — log in instead')
      } else if (msg.includes('password')) {
        setError(authError.message)
      } else {
        setError('Lost at sea — sign up didn’t go through. Try again.')
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
        <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={maxFontScale.display}>
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
      <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={maxFontScale.display}>
        Join the crew
      </Text>

      <SocialAuthSlot mode="sign-up" />

      <UsernameField field={usernameField} />
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
        <Text style={styles.footerText}>Already aboard?</Text>
        <Link href="/log-in" replace style={styles.link} accessibilityRole="link">
          Log in
        </Link>
      </View>
    </FormScreen>
  )
}

const useStyles = createStyles((c) => ({
  title: { ...type.title, color: c.accent, textAlign: 'center' },
  subtitle: { ...type.body, color: c.textMuted, textAlign: 'center' },
  muted: { ...type.small, color: c.textMuted },
  footerText: { ...type.body, color: c.textMuted },
  bad: { ...type.small, color: c.dangerText },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  link: { ...type.bodyBold, color: c.link, minHeight: minTouch, paddingVertical: spacing.md, textDecorationLine: 'underline' },
}))
