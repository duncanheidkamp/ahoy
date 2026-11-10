import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useToast } from '@/components/toast'
import { Button, Loading, MutedText, SectionTitle } from '@/components/ui'
import { usePhrases, useProfile, useSetActivePhrase } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { colors, minTouch, radii, spacing, type } from '@/theme'

export default function SettingsScreen() {
  const toast = useToast()
  const profile = useProfile()
  const phrases = usePhrases()
  const setActive = useSetActivePhrase()

  const choose = async (id: number) => {
    try {
      await setActive.mutateAsync(id)
    } catch {
      toast('Lost at sea — try again')
    }
  }

  const logOut = async () => {
    const { error } = await supabase.auth.signOut()
    // signOut clears the local session even if the network call fails.
    if (error) toast('Logged out on this device')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <SectionTitle>Account</SectionTitle>
        <Text style={styles.username} accessibilityLabel={`Signed in as @${profile.data?.username ?? ''}`}>
          @{profile.data?.username ?? '…'}
        </Text>
      </View>

      <View style={styles.section}>
        <SectionTitle>Your call</SectionTitle>
        <MutedText>What your crew sees when you hail them. Send more ahoys to unlock more.</MutedText>
        {phrases.isLoading ? (
          <Loading />
        ) : phrases.isError ? (
          <MutedText>Couldn&apos;t load phrases.</MutedText>
        ) : (
          <View accessibilityRole="radiogroup" style={styles.phraseList}>
            {(phrases.data ?? []).map((p) => {
              const selected = setActive.isPending ? setActive.variables === p.id : p.active
              const label = p.unlocked ? p.text : p.secret ? '???' : p.text
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: !p.unlocked }}
                  accessibilityLabel={p.unlocked ? label : `${label}, unlocks at ${p.unlock_at} ahoys sent`}
                  disabled={!p.unlocked || setActive.isPending}
                  onPress={() => choose(p.id)}
                  style={({ pressed }) => [
                    styles.phrase,
                    selected && styles.phraseSelected,
                    !p.unlocked && styles.phraseLocked,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.phraseText, selected && styles.phraseTextSelected]}>{label}</Text>
                  <Text style={[styles.phraseMeta, selected && styles.phraseTextSelected]}>
                    {selected ? 'Selected' : p.unlocked ? '' : `🔒 ${p.unlock_at.toLocaleString()}`}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        )}
      </View>

      <Button title="Log out" variant="danger" onPress={logOut} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  username: { ...type.heading, color: colors.text },
  phraseList: { gap: spacing.sm },
  phrase: {
    minHeight: minTouch + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.surfaceRaised,
  },
  phraseSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  phraseLocked: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  phraseText: { ...type.bodyBold, color: colors.text },
  phraseTextSelected: { color: colors.primaryText },
  phraseMeta: { ...type.small, color: colors.textMuted },
})
