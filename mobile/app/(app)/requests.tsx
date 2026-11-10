import { useState, type ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useToast } from '@/components/toast'
import { Button, Loading, MutedText, SectionTitle } from '@/components/ui'
import { useUserId } from '@/lib/auth'
import {
  useAcceptRequest,
  useCancelRequest,
  useDeclineRequest,
  useRequests,
  type FriendRequestRow,
} from '@/lib/queries'
import { colors, radii, spacing, type } from '@/theme'

function RequestItem({ request, children }: { request: FriendRequestRow; children: ReactNode }) {
  return (
    <View style={styles.item}>
      <Text style={styles.name} numberOfLines={1}>
        @{request.other.username}
      </Text>
      <View style={styles.actions}>{children}</View>
    </View>
  )
}

export default function RequestsScreen() {
  const userId = useUserId()
  const toast = useToast()
  const requests = useRequests(userId)
  const accept = useAcceptRequest()
  const decline = useDeclineRequest()
  const cancel = useCancelRequest()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const run = async (id: string, action: (id: string) => Promise<void>) => {
    setBusyId(id)
    try {
      await action(id)
    } catch {
      toast('Lost at sea — try again')
    } finally {
      setBusyId(null)
    }
  }

  if (requests.isLoading) return <Loading />

  const incoming = requests.data?.incoming ?? []
  const outgoing = requests.data?.outgoing ?? []

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          colors={[colors.primary]}
          onRefresh={async () => {
            setRefreshing(true)
            await requests.refetch().finally(() => setRefreshing(false))
          }}
        />
      }
    >
      {requests.isError && <MutedText>Couldn&apos;t load requests. Pull down to retry.</MutedText>}

      <View style={styles.section}>
        <SectionTitle>Incoming ({incoming.length})</SectionTitle>
        {incoming.length === 0 ? (
          <MutedText>No one is asking to join your crew.</MutedText>
        ) : (
          incoming.map((r) => (
            <RequestItem key={r.id} request={r}>
              <Button
                compact
                title="Accept"
                accessibilityLabel={`Accept @${r.other.username}`}
                loading={busyId === r.id && accept.isPending}
                disabled={busyId === r.id}
                onPress={() => run(r.id, accept.mutateAsync)}
              />
              <Button
                compact
                variant="secondary"
                title="Decline"
                accessibilityLabel={`Decline @${r.other.username}`}
                loading={busyId === r.id && decline.isPending}
                disabled={busyId === r.id}
                onPress={() => run(r.id, decline.mutateAsync)}
              />
            </RequestItem>
          ))
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle>Outgoing ({outgoing.length})</SectionTitle>
        {outgoing.length === 0 ? (
          <MutedText>No requests waiting on others.</MutedText>
        ) : (
          outgoing.map((r) => (
            <RequestItem key={r.id} request={r}>
              <Button
                compact
                variant="secondary"
                title="Cancel"
                accessibilityLabel={`Cancel request to @${r.other.username}`}
                loading={busyId === r.id}
                onPress={() => run(r.id, cancel.mutateAsync)}
              />
            </RequestItem>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
  },
  name: { ...type.bodyBold, color: colors.text, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
})
