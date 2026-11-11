// Top-of-screen banner for notifications that arrive while the app is open
// (the system banner is suppressed for our push types; see lib/push/foreground.ts,
// which also plays the sound and the success haptic for an incoming ahoy).

import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Pressable, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useMoments } from '@/components/motion'
import { pushEvents, pushRoutes } from '@/lib/push/events'
import type { InAppBanner } from '@/lib/push/foreground'
import { createStyles, maxFontScale, minTouch, radii, spacing, type } from '@/theme'

const BANNER_MS = 3500

export function InAppBannerHost() {
  const styles = useStyles()
  const m = useMoments()
  const insets = useSafeAreaInsets()
  const [banner, setBanner] = useState<InAppBanner | null>(null)
  const [progress] = useState(() => new Animated.Value(0))
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { inDuration, outDuration, offset } = m.overlay

  useEffect(() => {
    const hide = () => {
      Animated.timing(progress, { toValue: 0, duration: outDuration, useNativeDriver: true }).start(() =>
        setBanner(null)
      )
    }
    const unsubscribe = pushEvents.subscribe((e) => {
      if (e.type !== 'banner') return
      setBanner(e.banner)
      AccessibilityInfo.announceForAccessibility(`${e.banner.title} ${e.banner.message}`)
      Animated.timing(progress, { toValue: 1, duration: inDuration, useNativeDriver: true }).start()
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(hide, BANNER_MS)
    })
    return () => {
      unsubscribe()
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [progress, inDuration, outDuration])

  if (!banner) return null

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-offset, 0] })

  return (
    <Animated.View style={[styles.wrap, { top: insets.top + spacing.sm, opacity: progress, transform: [{ translateY }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${banner.title}, ${banner.message}. Open`}
        onPress={() => {
          setBanner(null)
          pushRoutes.request(banner.route)
        }}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      >
        <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={maxFontScale.display}>
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

const useStyles = createStyles((c) => ({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  banner: {
    minHeight: minTouch + 12,
    backgroundColor: c.surface,
    borderColor: c.primary,
    borderWidth: 2,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  pressed: { opacity: 0.85 },
  title: { ...type.heading, color: c.accent },
  message: { ...type.bodyBold, color: c.text },
}))
