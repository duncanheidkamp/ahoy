import { useEffect, useState } from 'react'
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useToast } from '@/components/toast'
import { Button, Loading, MutedText, SectionTitle } from '@/components/ui'
import { useUserId } from '@/lib/auth'
import { getPermission, registrationDeps, requestPermission } from '@/lib/push/native'
import { notificationSetting, type NotificationSetting } from '@/lib/push/prompt'
import { registerForPush, signOutWithPushCleanup } from '@/lib/push/registration'
import { usePhrases, useProfile, useSetActivePhrase } from '@/lib/queries'
import { colors, minTouch, radii, spacing, type } from '@/theme'

const SETTING_LABEL: Record<NotificationSetting, string> = {
  on: 'On',
  off: 'Off',
  blocked: 'Off — turn on in the Settings app',
}

function useNotificationSetting() {
  const [setting, setSetting] = useState<NotificationSetting | null>(null)
  useEffect(() => {
    let mounted = true
    const refresh = () =>
      getPermission()
        .then((p) => mounted && setSetting(notificationSetting(p)))
        .catch(() => {})
    refresh()
    // Pick up changes made in the system Settings app.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh())
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])
  return [setting, setSetting] as const
}

function NotificationsRow() {
  const userId = useUserId()
  const toast = useToast()
  const [setting, setSetting] = useNotificationSetting()
  const [busy, setBusy] = useState(false)

  const enable = async () => {
    if (setting === 'blocked') {
      await Linking.openSettings().catch(() => {})
      return
    }
    setBusy(true)
    try {
      const p = await requestPermission()
      setSetting(notificationSetting(p))
      if (p.granted) await registerForPush(registrationDeps, userId)
      else toast('Notifications stay off for now')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.section}>
      <SectionTitle>Notifications</SectionTitle>
      <View style={styles.row}>
        <Text style={styles.rowText} accessibilityLabel={`Notifications ${setting ? SETTING_LABEL[setting] : ''}`}>
          {setting ? SETTING_LABEL[setting] : '…'}
        </Text>
        {setting && setting !== 'on' ? (
          <Button
            compact
            title={setting === 'blocked' ? 'Open Settings' : 'Turn on'}
            loading={busy}
            onPress={enable}
          />
        ) : null}
      </View>
    </View>
  )
}

export default function SettingsScreen() {
  const toast = useToast()
  const profile = useProfile()
  const phrases = usePhrases()
  const setActive = useSetActivePhrase()

  const choose = async (id: number) => {
    try {
      await setActive.mutateAsync(id)
    } catch {
      toast('Lost at sea — try again')
    }
  }

  const [loggingOut, setLoggingOut] = useState(false)
  const logOut = async () => {
    setLoggingOut(true)
    // Removes this device's push token first (needs the session), then signs out.
    const { tokenRemoved } = await signOutWithPushCleanup(registrationDeps)
    if (!tokenRemoved) toast('Logged out. This phone may still get ahoys until you log in again')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <SectionTitle>Account</SectionTitle>
        <Text style={styles.username} accessibilityLabel={`Signed in as @${profile.data?.username ?? ''}`}>
          @{profile.data?.username ?? '…'}
        </Text>
      </View>

      <View style={styles.section}>
        <SectionTitle>Your call</SectionTitle>
        <MutedText>What your crew sees when you hail them. Send more ahoys to unlock more.</MutedText>
        {phrases.isLoading ? (
          <Loading />
        ) : phrases.isError ? (
          <MutedText>Couldn&apos;t load phrases.</MutedText>
        ) : (
          <View accessibilityRole="radiogroup" style={styles.phraseList}>
            {(phrases.data ?? []).map((p) => {
              const selected = setActive.isPending ? setActive.variables === p.id : p.active
              const label = p.unlocked ? p.text : p.secret ? '???' : p.text
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: !p.unlocked }}
                  accessibilityLabel={p.unlocked ? label : `${label}, unlocks at ${p.unlock_at} ahoys sent`}
                  disabled={!p.unlocked || setActive.isPending}
                  onPress={() => choose(p.id)}
                  style={({ pressed }) => [
                    styles.phrase,
                    selected && styles.phraseSelected,
                    !p.unlocked && styles.phraseLocked,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.phraseText, selected && styles.phraseTextSelected]}>{label}</Text>
                  <Text style={[styles.phraseMeta, selected && styles.phraseTextSelected]}>
                    {selected ? 'Selected' : p.unlocked ? '' : `🔒 ${p.unlock_at.toLocaleString()}`}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        )}
      </View>

      <NotificationsRow />

      <Button title="Log out" variant="danger" onPress={logOut} loading={loggingOut} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  username: { ...type.heading, color: colors.text },
  phraseList: { gap: spacing.sm },
  phrase: {
    minHeight: minTouch + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.surfaceRaised,
  },
  phraseSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  phraseLocked: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  phraseText: { ...type.bodyBold, color: colors.text },
  phraseTextSelected: { color: colors.primaryText },
  phraseMeta: { ...type.small, color: colors.textMuted },
  row: {
    minHeight: minTouch + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
  },
  rowText: { ...type.bodyBold, color: colors.text, flexShrink: 1 },
})
