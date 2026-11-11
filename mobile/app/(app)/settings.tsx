import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { AppState, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'

import { useToast } from '@/components/toast'
import { Button, Loading, MutedText, SectionTitle, TextField } from '@/components/ui'
import { appVersionLabel } from '@/lib/app-version'
import { useUserId } from '@/lib/auth'
import { LINKS_DOMAIN } from '@/lib/env'
import { legalLinks } from '@/lib/legal'
import { inviteMessage, inviteUrl } from '@/lib/links'
import { phraseItems, remainingLabel } from '@/lib/phrases'
import { getPermission, registrationDeps, requestPermission } from '@/lib/push/native'
import { notificationSetting, type NotificationSetting } from '@/lib/push/prompt'
import { registerForPush, signOutWithPushCleanup } from '@/lib/push/registration'
import {
  sendFeedback,
  useBlockedUsers,
  useMyStats,
  usePhrases,
  useProfile,
  useSetActivePhrase,
  useUnblockUser,
} from '@/lib/queries'
import { FEEDBACK_MAX } from '@/lib/reports'
import { googleSignOut } from '@/lib/social-auth-native'
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

function BlockedSection() {
  const toast = useToast()
  const blocked = useBlockedUsers()
  const unblock = useUnblockUser()

  return (
    <View style={styles.section}>
      <SectionTitle>Blocked sailors</SectionTitle>
      {blocked.isLoading ? (
        <Loading />
      ) : blocked.isError ? (
        <MutedText>Couldn&apos;t load your blocked list.</MutedText>
      ) : (blocked.data ?? []).length === 0 ? (
        <MutedText>No one. Long-press a crewmate to block or report them.</MutedText>
      ) : (
        (blocked.data ?? []).map((b) => (
          <View key={b.id} style={styles.row}>
            <Text style={styles.rowText} numberOfLines={1}>
              {b.username ? `@${b.username}` : 'A sailor'}
            </Text>
            <Button
              compact
              variant="secondary"
              title="Unblock"
              accessibilityLabel={`Unblock ${b.username ? `@${b.username}` : 'sailor'}`}
              loading={unblock.isPending && unblock.variables === b.id}
              onPress={() => unblock.mutateAsync(b.id).catch(() => toast('Lost at sea — try again'))}
            />
          </View>
        ))
      )}
    </View>
  )
}

/** The PWA's v0.4 "message in a bottle" feedback box. */
function FeedbackSection() {
  const userId = useUserId()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = message.trim()

  const submit = async () => {
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendFeedback(userId, appVersionLabel(), trimmed.slice(0, FEEDBACK_MAX))
      setSent(true)
      setMessage('')
    } catch {
      setError('Couldn’t send — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.section}>
      <SectionTitle>Send the crew a message</SectionTitle>
      {sent ? (
        <Text accessibilityLiveRegion="polite" style={styles.sent}>
          ✓ Message in a bottle sent! Thanks, sailor.
        </Text>
      ) : (
        <>
          <TextField
            label="Bugs, ideas, complaints about the poop deck…"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={FEEDBACK_MAX}
            style={styles.feedback}
            textAlignVertical="top"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Button title="Send" variant="secondary" onPress={submit} loading={busy} disabled={!trimmed} />
        </>
      )}
      <Text style={styles.version}>Ahoy {appVersionLabel()}</Text>
    </View>
  )
}

export default function SettingsScreen() {
  const toast = useToast()
  const profile = useProfile()
  const phrases = usePhrases()
  const stats = useMyStats()
  const setActive = useSetActivePhrase()
  const items = phraseItems(phrases.data ?? [], stats.data?.total_sent ?? 0)
  const username = profile.data?.username

  const invite = async () => {
    if (!username) return
    try {
      await Share.share({ message: inviteMessage(username, LINKS_DOMAIN), url: inviteUrl(username, LINKS_DOMAIN) })
    } catch {
      // dismissed
    }
  }

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
    await googleSignOut()
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
        <Button title="Invite friends" onPress={invite} disabled={!username} />
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
            {items.map((p) => {
              const selected = setActive.isPending ? setActive.variables === p.id : p.active
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: !p.unlocked }}
                  accessibilityLabel={p.unlocked ? p.text : `${p.text}, locked, ${remainingLabel(p.remaining)}`}
                  disabled={!p.unlocked || setActive.isPending}
                  onPress={() => choose(p.id)}
                  style={({ pressed }) => [
                    styles.phrase,
                    selected && styles.phraseSelected,
                    !p.unlocked && styles.phraseLocked,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.phraseText, selected && styles.phraseTextSelected]}>
                    {p.unlocked ? '' : '🔒 '}
                    {p.text}
                  </Text>
                  <Text style={[styles.phraseMeta, selected && styles.phraseTextSelected]}>
                    {selected ? 'Selected' : p.unlocked ? '' : remainingLabel(p.remaining)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        )}
      </View>

      <NotificationsRow />

      <BlockedSection />

      <FeedbackSection />

      <View style={styles.section}>
        <SectionTitle>Leave the ship</SectionTitle>
        <Button title="Log out" variant="secondary" onPress={logOut} loading={loggingOut} />
        <Button title="Delete account" variant="danger" onPress={() => router.push('/delete-account')} />
        {legalLinks(LINKS_DOMAIN).map((l) => (
          <Text
            key={l.url}
            accessibilityRole="link"
            style={styles.link}
            onPress={() => Linking.openURL(l.url).catch(() => {})}
          >
            {l.label}
          </Text>
        ))}
      </View>
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
  feedback: { minHeight: 96 },
  sent: { ...type.bodyBold, color: colors.success, textAlign: 'center', paddingVertical: spacing.md },
  error: { ...type.small, color: colors.dangerText },
  version: { ...type.small, color: colors.textMuted, textAlign: 'center' },
  link: { ...type.bodyBold, color: colors.primary, textAlign: 'center', minHeight: minTouch, paddingVertical: spacing.md },
})
