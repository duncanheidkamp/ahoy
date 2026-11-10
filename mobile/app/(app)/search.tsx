import { useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'

import { useToast } from '@/components/toast'
import { Button, Centered, Loading, MutedText, TextField } from '@/components/ui'
import { useUserId } from '@/lib/auth'
import { useDebounced } from '@/lib/use-debounced'
import { getBadge } from '@/lib/badges'
import { useAddFriend, useSearchUsers, type AddResult } from '@/lib/queries'
import { colors, rowColor, rowMinHeight, spacing, type } from '@/theme'


export default function SearchScreen() {
  const userId = useUserId()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query, 300)
  const search = useSearchUsers(debounced)
  const addFriend = useAddFriend(userId)
  const [added, setAdded] = useState<Record<string, AddResult>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)

  const onAdd = async (otherId: string) => {
    setPendingId(otherId)
    try {
      const result = await addFriend.mutateAsync(otherId)
      setAdded((prev) => ({ ...prev, [otherId]: result }))
    } catch {
      toast('Lost at sea — try again')
    } finally {
      setPendingId(null)
    }
  }

  const results = search.data ?? []
  const hasQuery = debounced.trim().length > 0

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <TextField
          label="Username"
          placeholder="Search by username"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {search.isLoading && hasQuery ? (
        <Loading />
      ) : (
        <FlatList
          data={hasQuery ? results : []}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={results.length === 0 || !hasQuery ? styles.emptyContainer : undefined}
          renderItem={({ item, index }) => {
            const state = added[item.id]
            const badge = getBadge(item.total_sent)
            return (
              <View style={[styles.row, { backgroundColor: rowColor(index) }]}>
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.username.toUpperCase()}
                  </Text>
                  {badge && (
                    <Text style={styles.badge}>
                      {badge.icon} {badge.label}
                    </Text>
                  )}
                </View>
                <Button
                  compact
                  variant={state ? 'secondary' : 'primary'}
                  title={state === 'crew' ? 'In Crew' : state === 'requested' ? 'Requested' : 'Add'}
                  accessibilityLabel={
                    state === 'crew'
                      ? `@${item.username} is in your crew`
                      : state === 'requested'
                        ? `Request sent to @${item.username}`
                        : `Add @${item.username} to your crew`
                  }
                  disabled={!!state}
                  loading={pendingId === item.id}
                  onPress={() => onAdd(item.id)}
                />
              </View>
            )
          }}
          ListEmptyComponent={
            <Centered>
              <MutedText>
                {!hasQuery
                  ? 'Search for sailors by username'
                  : search.isError
                    ? 'Search failed — check your connection'
                    : 'No sailors by that name'}
              </MutedText>
            </Centered>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBox: { padding: spacing.lg },
  emptyContainer: { flexGrow: 1 },
  row: {
    minHeight: rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowText: { flexShrink: 1, gap: spacing.xs },
  name: { ...type.heading, color: colors.onRow },
  badge: { ...type.small, color: colors.onRowMuted },
})
