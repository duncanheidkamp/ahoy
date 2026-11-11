// Celebrates each newly unlocked phrase once per user on this device:
// a modal for regular phrases, the PWA's full-screen "Yo!" reveal for the
// secret one (which, like the PWA, also switches you to it). The server
// decides what is unlocked (get_my_phrases); see lib/phrases.ts.
// On a device with no record for this user yet, everything already unlocked
// is marked seen silently (resolveSeen) — only later unlocks are celebrated.

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Modal, Pressable, Text, View, type StyleProp, type TextStyle } from 'react-native'
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { useMoments } from '@/components/motion'
import { useToast } from '@/components/toast'
import { Button } from '@/components/ui'
import { kv } from '@/lib/kv'
import {
  autoActivatePhraseId,
  celebrationFor,
  createSeenPhrases,
  newlyUnlocked,
  resolveSeen,
  shouldRefetchPhrases,
} from '@/lib/phrases'
import { queryKeys, useMyStats, usePhrases, useSetActivePhrase } from '@/lib/queries'
import { createStyles, maxFontScale, radii, spacing, type } from '@/theme'

const YO_REVEAL_MS = 3500

/** Text that scales in (or just fades in with Reduce Motion), <= 300 ms. */
function RevealText({
  children,
  style,
  maxScale,
  fit,
}: {
  children: ReactNode
  style: StyleProp<TextStyle>
  maxScale?: number
  fit?: boolean
}) {
  const m = useMoments()
  const t = useSharedValue(0)
  const { duration, fromScale, kind } = m.reveal
  useEffect(() => {
    t.set(
      withTiming(1, {
        duration,
        easing: kind === 'scale' ? Easing.out(Easing.back(1.4)) : Easing.linear,
        reduceMotion: ReduceMotion.Never,
      })
    )
  }, [t, duration, kind])
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.get() * (kind === 'scale' ? 2 : 1)),
    transform: [{ scale: fromScale + (1 - fromScale) * t.get() }],
  }))
  return (
    <Animated.Text
      style={[style, animated]}
      maxFontSizeMultiplier={maxScale}
      numberOfLines={fit ? 1 : undefined}
      adjustsFontSizeToFit={fit}
    >
      {children}
    </Animated.Text>
  )
}

export function PhraseCelebrationHost({ userId }: { userId: string }) {
  const styles = useStyles()
  const qc = useQueryClient()
  const toast = useToast()
  const phrases = usePhrases()
  const stats = useMyStats()
  const setActive = useSetActivePhrase()
  const seenStore = useMemo(() => createSeenPhrases(kv, userId), [userId])
  // Keyed by user so a switch of accounts never uses the previous record.
  // value: null = this device has no record for the user yet.
  const [record, setRecord] = useState<{ userId: string; value: number[] | null } | null>(null)
  const stored = record?.userId === userId ? record.value : undefined
  const setStored = (value: number[] | null) => setRecord({ userId, value })

  useEffect(() => {
    let mounted = true
    seenStore.read().then((value) => mounted && setRecord({ userId, value }))
    return () => {
      mounted = false
    }
  }, [seenStore, userId])

  const resolved = stored === undefined ? { seen: null, baseline: false } : resolveSeen(stored, phrases.data)
  const seen = resolved.seen
  const baselineIds = resolved.baseline ? seen : null
  useEffect(() => {
    if (!baselineIds) return
    let mounted = true
    seenStore
      .setAll(baselineIds)
      .then((value) => mounted && setRecord({ userId, value }))
      .catch(() => mounted && setRecord({ userId, value: baselineIds }))
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineIds?.join(','), seenStore, userId])

  // A send bumps total_sent in the cache; if that crosses a threshold, ask
  // the server (it stays the source of truth).
  const totalSent = stats.data?.total_sent ?? 0
  useEffect(() => {
    if (shouldRefetchPhrases(phrases.data, totalSent)) {
      void qc.invalidateQueries({ queryKey: queryKeys.phrases })
    }
  }, [phrases.data, totalSent, qc])

  const queue = seen ? newlyUnlocked(phrases.data, seen) : []
  const current = queue[0] ? celebrationFor(queue[0]) : null

  const markSeen = async (id: number) => {
    setStored(await seenStore.add(id))
  }

  const use = async (id: number, text: string) => {
    try {
      await setActive.mutateAsync(id)
      toast(`Your crew now hears “${text}”`)
    } catch {
      toast('Lost at sea — try again')
    }
  }

  // Yo! reveal: switch to it (as the PWA does), auto-dismiss.
  const yoId = autoActivatePhraseId(current)
  useEffect(() => {
    if (yoId === null) return
    setActive.mutate(yoId)
    AccessibilityInfo.announceForAccessibility('Secret unlocked: Yo!')
    const t = setTimeout(() => void markSeen(yoId), YO_REVEAL_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yoId])

  if (!current) return null

  if (current.kind === 'yo-reveal') {
    return (
      <Modal visible transparent={false} animationType="fade" onRequestClose={() => markSeen(current.phrase.id)}>
        <Pressable
          style={styles.reveal}
          onPress={() => markSeen(current.phrase.id)}
          accessibilityRole="button"
          accessibilityLabel={`Secret unlocked: ${current.phrase.text}. Tap to close.`}
        >
          <RevealText style={styles.revealText} maxScale={maxFontScale.reveal} fit>
            {current.phrase.text}
          </RevealText>
        </Pressable>
      </Modal>
    )
  }

  const { phrase } = current
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => markSeen(phrase.id)}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text style={styles.emoji} importantForAccessibility="no" accessibilityElementsHidden>
            🏴‍☠️
          </Text>
          <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={maxFontScale.display}>
            New call unlocked!
          </Text>
          <RevealText style={styles.phrase} maxScale={maxFontScale.display}>
            “{phrase.text}”
          </RevealText>
          <Text style={styles.body}>
            {phrase.unlock_at.toLocaleString()} ahoys sent. Use it to hail your crew?
          </Text>
          <Button
            title="Use it"
            onPress={async () => {
              await markSeen(phrase.id)
              await use(phrase.id, phrase.text)
            }}
          />
          <Button title="Later" variant="secondary" onPress={() => markSeen(phrase.id)} />
        </View>
      </View>
    </Modal>
  )
}

const useStyles = createStyles((c) => ({
  reveal: { flex: 1, backgroundColor: c.revealBackground, alignItems: 'center', justifyContent: 'center' },
  revealText: { ...type.reveal, color: c.revealText, paddingHorizontal: spacing.lg, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: spacing.xl },
  dialog: {
    backgroundColor: c.surface,
    borderRadius: radii.lg,
    borderColor: c.border,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  emoji: { fontSize: 48, textAlign: 'center' },
  title: { ...type.heading, color: c.accent, textAlign: 'center' },
  phrase: { ...type.flash, color: c.text, textAlign: 'center' },
  body: { ...type.body, color: c.textMuted, textAlign: 'center' },
}))
