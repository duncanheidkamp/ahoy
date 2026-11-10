import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { getBadge } from '@/lib/badges'
import type { CrewMember } from '@/lib/queries'
import { rowLabel } from '@/lib/send-machine'
import { useAhoySender } from '@/lib/use-ahoy-sender'
import { colors, radii, rowColor, rowMinHeight, spacing, type } from '@/theme'

interface Props {
  member: CrewMember
  index: number
  phrase: string
  onToast: (message: string) => void
  /** Long-press: Remove / Block / Report. */
  onLongPress?: (member: CrewMember) => void
}

/** Full-width Yo-style row. Tap anywhere to send. */
export const CrewRow = memo(function CrewRow({ member, index, phrase, onToast, onLongPress }: Props) {
  const { state, tap } = useAhoySender(member.id, phrase, onToast)
  const badge = getBadge(member.totalSent)
  const active = state.status !== 'idle'

  return (
    <Pressable
      onPress={tap}
      onLongPress={onLongPress ? () => onLongPress(member) : undefined}
      delayLongPress={450}
      accessibilityRole="button"
      accessibilityLabel={`Send Ahoy to @${member.username}`}
      accessibilityHint={`You've sent ${member.sentByMe} ${member.sentByMe === 1 ? 'ahoy' : 'ahoys'}${
        badge ? `. ${badge.label}` : ''
      }`}
      accessibilityState={{ busy: state.status === 'sending' }}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'More options' }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'longpress') onLongPress?.(member)
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: rowColor(index) }, pressed && styles.pressed]}
    >
      <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {rowLabel(state, member.username)}
      </Text>
      {!active && (
        <View style={styles.meta} importantForAccessibility="no-hide-descendants">
          {badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {badge.icon} {badge.label}
              </Text>
            </View>
          )}
          <Text style={styles.count}>{member.sentByMe}</Text>
        </View>
      )}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: {
    minHeight: rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  pressed: { opacity: 0.85 },
  name: { ...type.row, color: colors.onRow, flexShrink: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    backgroundColor: colors.badgeBackground,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: { ...type.small, color: colors.onRow },
  count: { ...type.bodyBold, color: colors.onRowMuted, minWidth: 24, textAlign: 'right' },
})
