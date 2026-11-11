// Celebrates each newly unlocked phrase once per user on this device:
// a modal for regular phrases, the PWA's full-screen "Yo!" reveal for the
// secret one (which, like the PWA, also switches you to it). The server
// decides what is unlocked (get_my_phrases); see lib/phrases.ts.
// On a device with no record for this user yet, everything already unlocked
// is marked seen silently (resolveSeen) — only later unlocks are celebrated.

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native'

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
import { colors, radii, spacing, type } from '@/theme'

const YO_REVEAL_MS = 3500

export function PhraseCelebrationHost({ userId }: { userId: string }) {
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
          <Text style={styles.revealText} adjustsFontSizeToFit numberOfLines={1}>
            {current.phrase.text}
          </Text>
        </Pressable>
      </Modal>
    )
  }

  const { phrase } = current
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => markSeen(phrase.id)}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text style={styles.emoji} importantForAccessibility="no">
            🏴‍☠️
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            New call unlocked!
          </Text>
          <Text style={styles.phrase}>“{phrase.text}”</Text>
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

const styles = StyleSheet.create({
  reveal: { flex: 1, backgroundColor: colors.revealBackground, alignItems: 'center', justifyContent: 'center' },
  revealText: { color: colors.revealText, fontSize: 160, fontWeight: '900', letterSpacing: -4, paddingHorizontal: spacing.lg },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.xl },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  emoji: { fontSize: 48, textAlign: 'center' },
  title: { ...type.heading, color: colors.accent, textAlign: 'center' },
  phrase: { ...type.title, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})
