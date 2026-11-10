import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CrewRow } from '@/components/crew-row'
import { useToast } from '@/components/toast'
import { Button, Centered, Loading, MutedText } from '@/components/ui'
import { useUserId } from '@/lib/auth'
import { INVITE_BASE_URL } from '@/lib/env'
import { useCrew, useProfile, useRequests } from '@/lib/queries'
import { colors, minTouch, radii, spacing, type } from '@/theme'

const DEFAULT_PHRASE = 'Ahoy!'

function HeaderButton({ label, count, onPress }: { label: string; count?: number; onPress: () => void }) {
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
  const userId = useUserId()
  const toast = useToast()
  const profile = useProfile()
  const { crew, totalSent, isLoading, isError, refetch } = useCrew()
  const requests = useRequests(userId)
  const [refreshing, setRefreshing] = useState(false)

  const phrase = profile.data?.activePhrase ?? DEFAULT_PHRASE
  const incomingCount = requests.data?.incoming.length ?? 0

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
    // TODO(phase-4): real universal link instead of the placeholder domain.
    const url = `${INVITE_BASE_URL}${username}`
    try {
      await Share.share({ message: `Join my crew on Ahoy! ${url}`, url })
    } catch {
      // User dismissed or share unavailable; nothing to do.
    }
  }, [profile.data?.username])

  const header = (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text accessibilityRole="header" style={styles.title}>
          AHOY
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
    body = <Loading />
  } else if (isError && crew.length === 0) {
    body = (
      <Centered>
        <MutedText>Couldn&apos;t load your crew. Pull down to try again.</MutedText>
        <Button title="Retry" variant="secondary" onPress={onRefresh} />
      </Centered>
    )
  } else {
    body = (
      <FlatList
        data={crew}
        keyExtractor={(m) => m.id}
        renderItem={({ item, index }) => <CrewRow member={item} index={index} phrase={phrase} onToast={toast} />}
        contentContainerStyle={crew.length === 0 ? styles.emptyContainer : undefined}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <Centered>
            <Text style={styles.emptyTitle}>No crew yet</Text>
            <MutedText>Find friends by username, or invite them to Ahoy.</MutedText>
            <View style={styles.emptyButtons}>
              <Button title="Find Friends" onPress={() => router.push('/search')} />
              <Button title="Invite" variant="secondary" onPress={invite} />
            </View>
          </Centered>
        }
      />
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}
      <View style={styles.body}>{body}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  title: { ...type.title, color: colors.accent },
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
  headerButtonText: { ...type.bodyBold, color: colors.textSubtle },
  countBadge: {
    backgroundColor: colors.countBadge,
    borderRadius: radii.pill,
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  countBadgeText: { ...type.small, color: colors.countBadgeText },
  pressed: { opacity: 0.7 },
  total: { ...type.small, color: colors.textMuted },
  emptyContainer: { flexGrow: 1 },
  emptyTitle: { ...type.heading, color: colors.accent },
  emptyButtons: { gap: spacing.md, alignSelf: 'stretch' },
})
