// Report a sailor (App Store guideline 1.2). Saved to public.reports; the
// notify-report Edge Function emails Duncan if Resend is configured.

import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'

import { FormScreen } from '@/components/screen'
import { useToast } from '@/components/toast'
import { Button, TextField } from '@/components/ui'
import { useUserId } from '@/lib/auth'
import { blockUser, invalidateCrew, reportUser } from '@/lib/queries'
import { REPORT_ALSO_BLOCK_DEFAULT, REPORT_NOTE_MAX, reportErrorMessage, validateReportNote } from '@/lib/reports'
import { useQueryClient } from '@tanstack/react-query'
import { colors, spacing, type } from '@/theme'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function ReportScreen() {
  const myId = useUserId()
  const toast = useToast()
  const qc = useQueryClient()
  const { id, username } = useLocalSearchParams<{ id: string; username: string }>()
  const [note, setNote] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(REPORT_ALSO_BLOCK_DEFAULT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validation = validateReportNote(note)
  const valid = typeof id === 'string' && UUID_RE.test(id) && id !== myId

  const submit = async () => {
    if (!valid || !validation.valid || busy) return
    setBusy(true)
    setError(null)
    try {
      await reportUser(id, validation.note)
    } catch (e) {
      setBusy(false)
      setError(reportErrorMessage(e as { message?: string }))
      return
    }
    if (alsoBlock) {
      await blockUser(myId, id).catch(() => toast('Report sent, but blocking failed — try again from the menu'))
      void invalidateCrew(qc)
      void qc.invalidateQueries({ queryKey: ['blocks'] })
    }
    setBusy(false)
    toast(alsoBlock ? `Reported and blocked @${username ?? ''}` : 'Report sent. Thanks for keeping the seas safe.')
    router.back()
  }

  return (
    <FormScreen edges={['bottom']}>
      <Text accessibilityRole="header" style={styles.title}>
        Report @{username ?? 'sailor'}
      </Text>
      <Text style={styles.body}>
        Tell us what happened. Reports go to the Ahoy developer and are reviewed within 24 hours. @{username ?? 'They'}{' '}
        won&apos;t know you reported them.
      </Text>
      <TextField
        label={`What happened? (optional, up to ${REPORT_NOTE_MAX} characters)`}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={REPORT_NOTE_MAX + 50}
        style={styles.note}
        textAlignVertical="top"
        hint={
          !validation.valid ? (
            <Text style={styles.error}>{validation.error}</Text>
          ) : (
            <Text style={styles.muted}>
              {note.trim().length}/{REPORT_NOTE_MAX}
            </Text>
          )
        }
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Also block @{username ?? 'them'}</Text>
        <Switch
          value={alsoBlock}
          onValueChange={setAlsoBlock}
          accessibilityLabel={`Also block @${username ?? 'them'}`}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      {error && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}
      <Button title="Send report" variant="danger" onPress={submit} loading={busy} disabled={!valid || !validation.valid} />
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
    </FormScreen>
  )
}

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.accent },
  body: { ...type.body, color: colors.textMuted },
  note: { minHeight: 120 },
  muted: { ...type.small, color: colors.textMuted },
  error: { ...type.small, color: colors.dangerText },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchLabel: { ...type.bodyBold, color: colors.text, flexShrink: 1 },
})
