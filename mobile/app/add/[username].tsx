// Invite link target: https://<LINKS_DOMAIN>/add/<username> (universal link /
// App Link) and ahoy://add/<username>. Lives at the root, outside the auth
// guards, so it opens in every state:
//   signed out          -> remember the link, go to Log in (resumed after)
//   no username yet     -> remember the link, go to Pick your pirate name
//   signed in           -> show the sailor with the right action
// A sailor who blocked you looks exactly like one who doesn't exist.

import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Share, StyleSheet, Text, View } from 'react-native'

import { useSailorActions } from '@/components/crew-actions'
import { useToast } from '@/components/toast'
import { Button, Centered, Loading, MutedText } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { getBadge } from '@/lib/badges'
import { LINKS_DOMAIN } from '@/lib/env'
import { kv } from '@/lib/kv'
import { createPendingInvites, inviteMessage, inviteUrl, parseInviteUsername } from '@/lib/links'
import { useAddFriend, useProfile, useUnblockUser, useUserCard } from '@/lib/queries'
import { colors, radii, spacing, type } from '@/theme'

const pendingInvites = createPendingInvites(kv)

function close() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

function SignedInCard({ myId, username }: { myId: string; username: string }) {
  const toast = useToast()
  const card = useUserCard(username)
  const addFriend = useAddFriend(myId)
  const unblock = useUnblockUser()
  const { open, sheet } = useSailorActions(myId)

  if (card.isLoading) return <Loading />
  if (card.isError) {
    return (
      <Centered>
        <MutedText>Couldn&apos;t look up @{username}. Check your connection.</MutedText>
        <Button title="Retry" variant="secondary" onPress={() => card.refetch()} />
      </Centered>
    )
  }
  const user = card.data
  if (!user) {
    return (
      <Centered>
        <Text style={styles.heading}>No sailor named @{username}</Text>
        <MutedText>Check the link, or search for them by username.</MutedText>
        <Button title="Done" variant="secondary" onPress={close} />
      </Centered>
    )
  }

  const badge = getBadge(Number(user.total_sent))
  const add = async () => {
    try {
      const result = await addFriend.mutateAsync(user.id)
      toast(result === 'crew' ? `@${user.username} joined your crew!` : `Request sent to @${user.username}`)
    } catch {
      toast('Lost at sea — try again')
    }
  }

  let action
  switch (user.relation) {
    case 'self':
      action = (
        <>
          <MutedText>That&apos;s your own invite link. Send it to your crew:</MutedText>
          <Button
            title="Share invite"
            onPress={() =>
              Share.share({
                message: inviteMessage(user.username, LINKS_DOMAIN),
                url: inviteUrl(user.username, LINKS_DOMAIN),
              }).catch(() => {})
            }
          />
        </>
      )
      break
    case 'crew':
      action = <Button title="In your crew" variant="secondary" disabled />
      break
    case 'requested':
      // Also shown when they declined — never reveal that.
      action = <Button title="Request sent" variant="secondary" disabled />
      break
    case 'incoming':
      action = <Button title="Accept request" onPress={add} loading={addFriend.isPending} />
      break
    case 'blocked':
      action = (
        <>
          <MutedText>You blocked @{user.username}.</MutedText>
          <Button
            title="Unblock"
            variant="secondary"
            loading={unblock.isPending}
            onPress={() => unblock.mutateAsync(user.id).catch(() => toast('Lost at sea — try again'))}
          />
        </>
      )
      break
    default:
      action = <Button title="Add to crew" onPress={add} loading={addFriend.isPending} />
  }

  return (
    <View style={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Join the crew of</Text>
        <Text style={styles.username} numberOfLines={1} adjustsFontSizeToFit>
          @{user.username}
        </Text>
        {badge && (
          <Text style={styles.badge}>
            {badge.icon} {badge.label}
          </Text>
        )}
      </View>
      {action}
      <Button title="Done" variant="secondary" onPress={close} />
      {user.relation !== 'self' && (
        <Button
          title="More…"
          variant="secondary"
          accessibilityLabel={`More options for @${user.username}`}
          onPress={() => open({ id: user.id, username: user.username }, { inCrew: user.relation === 'crew' })}
        />
      )}
      {sheet}
    </View>
  )
}

export default function AddByLinkScreen() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = parseInviteUsername(params.username)
  const { session, loading } = useAuth()
  const profile = useProfile({ enabled: !!session })
  const [saved, setSaved] = useState(false)

  const needsLogin = !loading && !session
  const needsUsername = !!session && profile.data?.username === null

  useEffect(() => {
    if (!username || !(needsLogin || needsUsername)) return
    pendingInvites.save(username).finally(() => setSaved(true))
  }, [username, needsLogin, needsUsername])

  const header = (
    <Stack.Screen
      options={{
        title: 'Join the crew',
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.accent,
      }}
    />
  )

  if (loading) return <Loading />
  if (!username) {
    return (
      <>
        {header}
        <Centered>
          <Text style={styles.heading}>That link looks broken</Text>
          <MutedText>Ask your friend to send it again.</MutedText>
          <Button title="Done" variant="secondary" onPress={close} />
        </Centered>
      </>
    )
  }
  if (needsLogin) return saved ? <Redirect href="/log-in" /> : <Loading />
  if (needsUsername) return saved ? <Redirect href="/pick-username" /> : <Loading />
  if (!session || profile.isLoading) return <Loading />

  return (
    <>
      {header}
      <SignedInCard myId={session.user.id} username={username} />
    </>
  )
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  heading: { ...type.heading, color: colors.accent, textAlign: 'center' },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: radii.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardLabel: { ...type.small, color: colors.onRowMuted },
  username: { ...type.title, color: colors.onRow },
  badge: { ...type.small, color: colors.onRowMuted },
})
