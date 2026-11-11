// Username input with live format + availability checks. Shared by Sign up
// and the social-login "Pick your pirate name" screen.

import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'

import { TextField } from '@/components/ui'
import { useUsernameAvailable } from '@/lib/queries'
import { useDebounced } from '@/lib/use-debounced'
import { normalizeUsername, USERNAME_MAX, validateUsername } from '@/lib/username'
import { createStyles, spacing, type, useTheme } from '@/theme'

export function useUsernameField() {
  const styles = useStyles()
  const { colors } = useTheme()
  const [username, setUsername] = useState('')
  const validation = validateUsername(username)
  const debouncedUsername = useDebounced(username, 350)
  const availability = useUsernameAvailable(debouncedUsername, validation.valid && debouncedUsername === username)
  const settled = debouncedUsername === username && !availability.isFetching
  const available = validation.valid && settled && availability.data === true

  let hint: ReactNode = null
  if (username.length > 0 && !validation.valid) {
    hint = <Text style={styles.bad}>{validation.error}</Text>
  } else if (validation.valid && !settled) {
    hint = (
      <View style={styles.hintRow}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.muted}>Checking…</Text>
      </View>
    )
  } else if (validation.valid && availability.isError) {
    hint = <Text style={styles.bad}>Couldn&apos;t check — are you online?</Text>
  } else if (validation.valid && availability.data === false) {
    hint = <Text style={styles.bad}>@{username} is taken</Text>
  } else if (available) {
    hint = <Text style={styles.good}>@{username} is available</Text>
  }

  return {
    username,
    setUsername: (t: string) => setUsername(normalizeUsername(t)),
    available,
    hint,
    recheck: () => void availability.refetch(),
  }
}

export function UsernameField({
  field,
  label = 'Username',
  onSubmitEditing,
}: {
  field: ReturnType<typeof useUsernameField>
  label?: string
  onSubmitEditing?: () => void
}) {
  return (
    <TextField
      label={label}
      value={field.username}
      onChangeText={field.setUsername}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="username-new"
      textContentType="username"
      maxLength={USERNAME_MAX}
      hint={field.hint}
      onSubmitEditing={onSubmitEditing}
    />
  )
}

const useStyles = createStyles((c) => ({
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muted: { ...type.small, color: c.textMuted },
  good: { ...type.small, color: c.success },
  bad: { ...type.small, color: c.dangerText },
}))
