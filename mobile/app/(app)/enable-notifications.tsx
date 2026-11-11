// Friendly pre-prompt shown before the system permission dialog, once the
// user has a crew (see lib/push/prompt.ts). The system dialog only appears
// after "Turn on notifications", so a "Not now" doesn't burn iOS's one ask.

import { router } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useToast } from '@/components/toast'
import { Button, MutedText } from '@/components/ui'
import { useUserId } from '@/lib/auth'
import { kv } from '@/lib/kv'
import { STORAGE_KEYS } from '@/lib/push/constants'
import { registrationDeps, requestPermission } from '@/lib/push/native'
import { registerForPush } from '@/lib/push/registration'
import { createStyles, maxFontScale, spacing, type } from '@/theme'

export default function EnableNotificationsScreen() {
  const styles = useStyles()
  const userId = useUserId()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const enable = async () => {
    setBusy(true)
    try {
      const permission = await requestPermission()
      if (permission.granted) {
        await registerForPush(registrationDeps, userId)
        toast("You'll hear it when your crew hails you")
      } else {
        toast('You can turn notifications on later in Settings')
      }
    } finally {
      setBusy(false)
      close()
    }
  }

  const notNow = async () => {
    await kv.set(STORAGE_KEYS.prePromptDismissedAt, Date.now()).catch(() => {})
    close()
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.icon} importantForAccessibility="no" accessibilityElementsHidden>
          🔔
        </Text>
        <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={maxFontScale.display}>
          Hear the call?
        </Text>
        <MutedText>
          Turn on notifications to get an Ahoy the moment your crew sends one — even when your phone is locked — and
          send one back without opening the app.
        </MutedText>
        <View style={styles.buttons}>
          <Button title="Turn on notifications" onPress={enable} loading={busy} />
          <Button title="Not now" variant="secondary" onPress={notNow} disabled={busy} />
        </View>
      </View>
    </SafeAreaView>
  )
}

const useStyles = createStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xl },
  title: { ...type.title, color: c.accent, textAlign: 'center' },
  buttons: { gap: spacing.md },
  icon: { fontSize: 56, textAlign: 'center' },
}))
