// Top-of-screen banner for notifications that arrive while the app is open
// (the system banner is suppressed for our push types; see lib/push/foreground.ts).

import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { pushEvents, pushRoutes } from '@/lib/push/events'
import type { InAppBanner } from '@/lib/push/foreground'
import { colors, minTouch, radii, spacing, type } from '@/theme'

const BANNER_MS = 3500

export function InAppBannerHost() {
  const insets = useSafeAreaInsets()
  const [banner, setBanner] = useState<InAppBanner | null>(null)
  const [opacity] = useState(() => new Animated.Value(0))
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const hide = () => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setBanner(null))
    }
    const unsubscribe = pushEvents.subscribe((e) => {
      if (e.type !== 'banner') return
      setBanner(e.banner)
      AccessibilityInfo.announceForAccessibility(`${e.banner.title} ${e.banner.message}`)
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start()
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(hide, BANNER_MS)
    })
    return () => {
      unsubscribe()
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [opacity])

  if (!banner) return null

  return (
    <Animated.View style={[styles.wrap, { top: insets.top + spacing.sm, opacity }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${banner.title}, ${banner.message}. Open`}
        onPress={() => {
          setBanner(null)
          pushRoutes.request(banner.route)
        }}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      >
        <Text style={styles.title} numberOfLines={1}>
          {banner.title}
        </Text>
        {banner.message ? (
          <Text style={styles.message} numberOfLines={2}>
            {banner.message}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  banner: {
    minHeight: minTouch + 12,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.primary,
    borderWidth: 2,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  pressed: { opacity: 0.85 },
  title: { ...type.heading, color: colors.accent },
  message: { ...type.bodyBold, color: colors.text },
})
