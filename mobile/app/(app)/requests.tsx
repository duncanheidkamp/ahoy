import { useState, type ReactNode } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'

import { useToast } from '@/components/toast'
import { Button, CardSkeleton, MutedText, SectionTitle } from '@/components/ui'
import { useUserId } from '@/lib/auth'
import {
  useAcceptRequest,
  useCancelRequest,
  useDeclineRequest,
  useRequests,
  type FriendRequestRow,
} from '@/lib/queries'
import { createStyles, radii, spacing, type, useTheme } from '@/theme'

function RequestItem({ request, note, children }: { request: FriendRequestRow; note?: string; children: ReactNode }) {
  const styles = useStyles()
  return (
    <View style={styles.item}>
      <View style={styles.nameBox}>
        <Text style={styles.name} numberOfLines={1}>
          @{request.other.username}
        </Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <View style={styles.actions}>{children}</View>
    </View>
  )
}

export default function RequestsScreen() {
  const styles = useStyles()
  const { colors } = useTheme()
  const userId = useUserId()
  const toast = useToast()
  const requests = useRequests(userId)
  const accept = useAcceptRequest()
  const decline = useDeclineRequest()
  const cancel = useCancelRequest(userId)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const run = async <T,>(id: string, action: (arg: T) => Promise<void>, arg: T) => {
    setBusyId(id)
    try {
      await action(arg)
    } catch {
      toast('Lost at sea — try again')
    } finally {
      setBusyId(null)
    }
  }

  if (requests.isLoading) {
    return (
      <View style={[styles.container, styles.content]}>
        <CardSkeleton count={3} />
      </View>
    )
  }

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
      {requests.isError && <MutedText>Lost at sea — couldn&apos;t load requests. Pull down to try again.</MutedText>}

      <View style={styles.section}>
        <SectionTitle>Incoming ({incoming.length})</SectionTitle>
        {incoming.length === 0 ? (
          <MutedText align="left">No one&apos;s knocking on the hull yet. Share your invite link from Settings.</MutedText>
        ) : (
          incoming.map((r) => (
            <RequestItem key={r.id} request={r}>
              <Button
                compact
                title="Accept"
                accessibilityLabel={`Accept @${r.other.username}`}
                loading={busyId === r.id && accept.isPending}
                disabled={busyId === r.id}
                onPress={() => run(r.id, accept.mutateAsync, r.id)}
              />
              <Button
                compact
                variant="secondary"
                title="Decline"
                accessibilityLabel={`Decline @${r.other.username}`}
                loading={busyId === r.id && decline.isPending}
                disabled={busyId === r.id}
                onPress={() => run(r.id, decline.mutateAsync, r.id)}
              />
            </RequestItem>
          ))
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle>Outgoing ({outgoing.length})</SectionTitle>
        {outgoing.length === 0 ? (
          <MutedText align="left">No requests waiting on others.</MutedText>
        ) : (
          outgoing.map((r) => (
            // Declined requests look exactly like pending ones here.
            <RequestItem key={r.id} request={r} note="Request sent">
              <Button
                compact
                variant="secondary"
                title="Cancel"
                accessibilityLabel={`Cancel request to @${r.other.username}`}
                loading={busyId === r.id}
                onPress={() => run(r.id, cancel.mutateAsync, r)}
              />
            </RequestItem>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const useStyles = createStyles((c) => ({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: c.surfaceRaised,
    borderRadius: radii.md,
  },
  nameBox: { flexShrink: 1, gap: spacing.xs },
  name: { ...type.bodyBold, color: c.text },
  note: { ...type.small, color: c.textMuted },
  actions: { flexDirection: 'row', gap: spacing.sm },
}))
