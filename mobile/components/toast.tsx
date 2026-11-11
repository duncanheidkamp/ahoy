import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useMoments } from '@/components/motion'
import { createStyles, radii, spacing, type } from '@/theme'

const TOAST_MS = 2500

const ToastContext = createContext<(message: string) => void>(() => {})

/** Bottom toast: slides up and fades (fade only with Reduce Motion). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useStyles()
  const m = useMoments()
  const insets = useSafeAreaInsets()
  const [message, setMessage] = useState<string | null>(null)
  const [progress] = useState(() => new Animated.Value(0))
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { inDuration, outDuration, offset } = m.overlay

  const show = useCallback(
    (text: string) => {
      setMessage(text)
      AccessibilityInfo.announceForAccessibility(text)
      Animated.timing(progress, { toValue: 1, duration: inDuration, useNativeDriver: true }).start()
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => {
        Animated.timing(progress, { toValue: 0, duration: outDuration, useNativeDriver: true }).start(() =>
          setMessage(null)
        )
      }, TOAST_MS)
    },
    [progress, inDuration, outDuration]
  )

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] })

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message !== null && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { bottom: insets.bottom + spacing.xl, opacity: progress, transform: [{ translateY }] }]}
        >
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

const useStyles = createStyles((c) => ({
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: c.toastBackground,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  text: { ...type.bodyBold, color: c.toastText, textAlign: 'center' },
}))
