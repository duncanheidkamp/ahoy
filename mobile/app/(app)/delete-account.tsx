// Settings -> Delete account (required by Apple, guideline 5.1.1(v)). Type
// your username to confirm; calls the delete-account Edge Function (which
// also revokes Sign in with Apple tokens), then clears this device and signs
// out locally.

import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { FormScreen } from '@/components/screen'
import { Button, TextField } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { canConfirmDelete, deleteAccount } from '@/lib/delete-account'
import { clearLocalState } from '@/lib/local-state'
import { useProfile } from '@/lib/queries'
import { appleAuthorizationCodeForDeletion, googleSignOut } from '@/lib/social-auth-native'
import { supabase } from '@/lib/supabase'
import { colors, type } from '@/theme'

export default function DeleteAccountScreen() {
  const { session } = useAuth()
  const qc = useQueryClient()
  const profile = useProfile()
  const username = profile.data?.username ?? null
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmed = canConfirmDelete(typed, username)
  const userId = session?.user.id
  const hasApple = !!session?.user.identities?.some((i) => i.provider === 'apple') ||
    (session?.user.app_metadata?.providers as string[] | undefined)?.includes('apple') === true

  const onDelete = async () => {
    if (!confirmed || busy || !userId) return
    setBusy(true)
    setError(null)
    const result = await deleteAccount({
      getAppleAuthorizationCode: () => appleAuthorizationCodeForDeletion(hasApple),
      invokeDelete: async (body) => {
        const { error: invokeError } = await supabase.functions.invoke('delete-account', { body })
        return { error: invokeError }
      },
      clearLocalState: async () => {
        await clearLocalState(userId)
        await googleSignOut()
        qc.clear()
      },
      signOutLocal: async () => {
        await supabase.auth.signOut({ scope: 'local' })
      },
    })
    setBusy(false)
    if (result === 'failed') setError('Couldn’t delete your account — check your connection and try again')
    // On success the auth gate swaps to Log in.
  }

  return (
    <FormScreen edges={['bottom']}>
      <Text accessibilityRole="header" style={styles.title}>
        Delete your account?
      </Text>
      <Text style={styles.body}>
        This permanently deletes @{username ?? '…'}, your crew, your blocks, the reports and feedback you sent, and every
        ahoy you&apos;ve sent. Ahoys you received stay in your friends&apos; counts. This can&apos;t be undone.
      </Text>
      <TextField
        label={`Type ${username ?? 'your username'} to confirm`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={username ?? ''}
      />
      {error && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}
      <Button title="Delete forever" variant="danger" onPress={onDelete} loading={busy} disabled={!confirmed} />
      <Button title="Keep my account" variant="secondary" onPress={() => router.back()} disabled={busy} />
    </FormScreen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.dangerText },
  body: { ...type.body, color: colors.textMuted },
  error: { ...type.small, color: colors.dangerText },
})
