// One-time username pick for Sign in with Apple / Google accounts. The root
// layout shows this whenever get_my_profile() has no username; claiming one
// flips the guard to the app, which then resumes any pending invite link.

import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { FormScreen } from '@/components/screen'
import { Button } from '@/components/ui'
import { UsernameField, useUsernameField } from '@/components/username-field'
import { registrationDeps } from '@/lib/push/native'
import { signOutWithPushCleanup } from '@/lib/push/registration'
import { useClaimUsername } from '@/lib/queries'
import { googleSignOut } from '@/lib/social-auth-native'
import { colors, minTouch, spacing, type } from '@/theme'

export default function PickUsernameScreen() {
  const field = useUsernameField()
  const claim = useClaimUsername()
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async () => {
    if (!field.available || claim.isPending) return
    setError(null)
    try {
      await claim.mutateAsync(field.username)
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === '23505') {
        setError('That name was just taken — pick another')
        field.recheck()
      } else if (code === '42501') {
        // Already set (e.g. on another device): reload the profile.
        setError('You already have a name — reloading…')
      } else {
        setError('Lost at sea — try again')
      }
    }
  }

  return (
    <FormScreen>
      <Text accessibilityRole="header" style={styles.title}>
        Pick your pirate name
      </Text>
      <Text style={styles.subtitle}>
        It&apos;s how your crew finds you and what they see when you hail them. You can&apos;t change it later.
      </Text>

      <UsernameField field={field} label="Pirate name" onSubmitEditing={onSubmit} />

      {error && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}

      <Button title="Set sail" onPress={onSubmit} loading={claim.isPending} disabled={!field.available} />

      <Text
        accessibilityRole="button"
        style={styles.link}
        onPress={async () => {
          await googleSignOut()
          await signOutWithPushCleanup(registrationDeps)
        }}
      >
        Wrong account? Log out
      </Text>
    </FormScreen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.accent, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  error: { ...type.small, color: colors.dangerText },
  link: {
    ...type.bodyBold,
    color: colors.primary,
    textAlign: 'center',
    minHeight: minTouch,
    paddingVertical: spacing.md,
  },
})
