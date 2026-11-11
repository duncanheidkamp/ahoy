import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, Share, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useSailorActions } from '@/components/crew-actions'
import { CrewRow } from '@/components/crew-row'
import { useToast } from '@/components/toast'
import { Button, EmptyState, RowSkeleton } from '@/components/ui'
import { useUserId } from '@/lib/auth'
import { LINKS_DOMAIN } from '@/lib/env'
import { inviteMessage, inviteUrl } from '@/lib/links'
import { DEFAULT_PHRASE } from '@/lib/phrases'
import { usePrePromptOffer } from '@/lib/push/use-push'
import { useCrew, useProfile, useRequests, type CrewMember } from '@/lib/queries'
import { createStyles, maxFontScale, minTouch, radii, spacing, type, useTheme } from '@/theme'

function HeaderButton({ label, count, onPress }: { label: string; count?: number; onPress: () => void }) {
  const styles = useStyles()
  const a11y = count ? `${label}, ${count} pending` : label
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
      style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
    >
      <Text style={styles.headerButtonText}>{label}</Text>
      {count ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export default function CrewScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const userId = useUserId()
  const toast = useToast()
  const profile = useProfile()
  const { crew, totalSent, isLoading, isError, refetch } = useCrew()
  const requests = useRequests(userId)
  const [refreshing, setRefreshing] = useState(false)
  const actions = useSailorActions(userId)
  const openActions = useCallback(
    (m: CrewMember) => actions.open({ id: m.id, username: m.username }, { inCrew: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions.open]
  )

  const phrase = profile.data?.activePhrase ?? DEFAULT_PHRASE
  const incomingCount = requests.data?.incoming.length ?? 0

  // Notification pre-prompt once the first crewmate is aboard (not at signup).
  usePrePromptOffer(crew.length)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([refetch(), requests.refetch(), profile.refetch()])
    } finally {
      setRefreshing(false)
    }
  }, [refetch, requests, profile])

  const invite = useCallback(async () => {
    const username = profile.data?.username
    if (!username) return
    try {
      await Share.share({ message: inviteMessage(username, LINKS_DOMAIN), url: inviteUrl(username, LINKS_DOMAIN) })
    } catch {
      // User dismissed or share unavailable; nothing to do.
    }
  }, [profile.data?.username])

  const header = (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text
          accessibilityRole="header"
          accessibilityLabel="Ahoy, your crew"
          style={styles.title}
          maxFontSizeMultiplier={maxFontScale.display}
        >
          Ahoy!
        </Text>
        <View style={styles.headerButtons}>
          <HeaderButton label="Find" onPress={() => router.push('/search')} />
          <HeaderButton label="Requests" count={incomingCount} onPress={() => router.push('/requests')} />
          <HeaderButton label="Settings" onPress={() => router.push('/settings')} />
        </View>
      </View>
      <Text style={styles.total} accessibilityLabel={`${totalSent} ahoys sent in total`}>
        {totalSent.toLocaleString()} {totalSent === 1 ? 'ahoy' : 'ahoys'} sent
      </Text>
    </View>
  )

  let body
  if (isLoading) {
    body = <RowSkeleton />
  } else if (isError && crew.length === 0) {
    body = (
      <EmptyState icon="🌊" title="Lost at sea" message="Couldn’t reach your crew. Check your connection and try again.">
        <Button title="Try again" variant="secondary" onPress={onRefresh} loading={refreshing} />
      </EmptyState>
    )
  } else {
    body = (
      <FlatList
        data={crew}
        keyExtractor={(m) => m.id}
        renderItem={({ item, index }) => (
          <CrewRow member={item} index={index} phrase={phrase} onToast={toast} onLongPress={openActions} />
        )}
        contentContainerStyle={crew.length === 0 ? styles.emptyContainer : undefined}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="🧭"
            title="No crew yet"
            message="Every ship needs a crew. Find friends by username, or send them your invite link."
          >
            <Button title="Find friends" onPress={() => router.push('/search')} />
            <Button title="Invite friends" variant="secondary" onPress={invite} />
          </EmptyState>
        }
      />
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}
      <View style={styles.body}>{body}</View>
      {actions.sheet}
    </SafeAreaView>
  )
}

const useStyles = createStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  body: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: c.surface,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: spacing.md,
  },
  title: { ...type.title, color: c.accent },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  headerButton: {
    minHeight: minTouch,
    minWidth: minTouch,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  headerButtonText: { ...type.bodyBold, color: c.textSubtle },
  countBadge: {
    backgroundColor: c.countBadge,
    borderRadius: radii.pill,
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  countBadgeText: { ...type.small, color: c.countBadgeText },
  pressed: { opacity: 0.7 },
  total: { ...type.small, color: c.textMuted },
  emptyContainer: { flexGrow: 1 },
}))
