import { memo, useEffect } from 'react'
import { Pressable, Text, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { useMoments } from '@/components/motion'
import { getBadge } from '@/lib/badges'
import type { CrewMember } from '@/lib/queries'
import { useAhoySender } from '@/lib/use-ahoy-sender'
import { createStyles, maxFontScale, radii, rowColor, rowMinHeight, spacing, type } from '@/theme'

interface Props {
  member: CrewMember
  index: number
  phrase: string
  onToast: (message: string) => void
  /** Long-press: Remove / Block / Report. */
  onLongPress?: (member: CrewMember) => void
}

/** Width of the wave crest that sweeps across the row on send. */
const CREST = 120
/** At this Dynamic Type scale the badge/count move under the name. */
const STACK_AT_FONT_SCALE = 1.6

/**
 * Full-width Yo-style row. Tap anywhere to send: medium haptic, a wave sweeps
 * across, and the name flips to your phrase in Pirata One (scaling in). With
 * Reduce Motion: a foam fade and a plain text fade instead.
 */
export const CrewRow = memo(function CrewRow({ member, index, phrase, onToast, onLongPress }: Props) {
  const styles = useStyles()
  const m = useMoments()
  const { fontScale } = useWindowDimensions()
  const { state, tap } = useAhoySender(member.id, phrase, onToast)
  const badge = getBadge(member.totalSent)
  const active = state.status !== 'idle'
  const stacked = fontScale >= STACK_AT_FONT_SCALE

  const wave = useSharedValue(1)
  const flash = useSharedValue(1)
  const width = useSharedValue(0)
  const sending = state.status === 'sending'
  const sweep = m.ripple.kind === 'sweep'
  const peak = m.ripple.peakOpacity
  const fromScale = m.flash.fromScale

  useEffect(() => {
    if (!sending) return
    // We pick the reduced variant ourselves (useMoments), so Reanimated must
    // not skip it: ReduceMotion.Never.
    wave.set(0)
    wave.set(withTiming(1, { duration: m.ripple.duration, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never }))
    flash.set(0)
    flash.set(
      withTiming(1, {
        duration: m.flash.duration,
        easing: m.flash.kind === 'scale' ? Easing.out(Easing.back(1.8)) : Easing.linear,
        reduceMotion: ReduceMotion.Never,
      })
    )
  }, [sending, wave, flash, m.ripple.duration, m.flash.duration, m.flash.kind])

  const waveStyle = useAnimatedStyle(() => {
    const p = wave.get()
    if (!sweep) return { opacity: interpolate(p, [0, 0.35, 1], [0, peak, 0]), transform: [{ translateX: 0 }] }
    return {
      opacity: interpolate(p, [0, 0.1, 0.75, 1], [0, 1, 1, 0]),
      transform: [{ translateX: interpolate(p, [0, 1], [-CREST * 1.5, width.get() + CREST * 0.5]) }, { skewX: '-18deg' }],
    }
  })

  const flashStyle = useAnimatedStyle(() => {
    const f = flash.get()
    return {
      opacity: Math.min(1, interpolate(f, [0, fromScale < 1 ? 0.4 : 1], [0, 1])),
      transform: [{ scale: interpolate(f, [0, 1], [fromScale, 1]) }],
    }
  })

  return (
    <Pressable
      onPress={tap}
      onLongPress={onLongPress ? () => onLongPress(member) : undefined}
      delayLongPress={450}
      onLayout={(e) => width.set(e.nativeEvent.layout.width)}
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
      style={({ pressed }) => [
        styles.row,
        stacked && styles.rowStacked,
        { backgroundColor: rowColor(index) },
        pressed && !active && styles.pressed,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={[sweep ? styles.crest : styles.foam, waveStyle]}
      />
      {active ? (
        <Animated.Text
          style={[styles.flash, flashStyle]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          maxFontSizeMultiplier={maxFontScale.flash}
          importantForAccessibility="no"
        >
          {state.phrase}
        </Animated.Text>
      ) : (
        <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5}>
          {member.username.toUpperCase()}
        </Text>
      )}
      {!active && (
        <View style={styles.meta} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
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

const useStyles = createStyles((c) => ({
  row: {
    minHeight: rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
  },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: spacing.sm },
  pressed: { opacity: 0.85 },
  crest: {
    position: 'absolute',
    top: -spacing.lg,
    bottom: -spacing.lg,
    left: 0,
    width: CREST,
    borderRadius: radii.pill,
    backgroundColor: c.ripple,
  },
  foam: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.ripple },
  name: { ...type.row, color: c.onRow, flexShrink: 1 },
  flash: { ...type.flash, color: c.onRow, flexShrink: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  badge: {
    backgroundColor: c.badgeBackground,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: { ...type.small, color: c.onRow },
  count: { ...type.bodyBold, color: c.onRowMuted, minWidth: 24, textAlign: 'right' },
}))
