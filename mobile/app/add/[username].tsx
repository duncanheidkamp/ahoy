// Invite link target: https://<LINKS_DOMAIN>/add/<username> (universal link /
// App Link) and ahoy://add/<username>. Lives at the root, outside the auth
// guards, so it opens in every state:
//   signed out          -> remember the link, go to Log in (resumed after)
//   no username yet     -> remember the link, go to Pick your pirate name
//   signed in           -> show the sailor with the right action
// A sailor who blocked you looks exactly like one who doesn't exist.

import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Share, Text, View } from 'react-native'

import { useSailorActions } from '@/components/crew-actions'
import { useToast } from '@/components/toast'
import { Button, EmptyState, Loading, MutedText } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { getBadge } from '@/lib/badges'
import { LINKS_DOMAIN } from '@/lib/env'
import { kv } from '@/lib/kv'
import { createPendingInvites, inviteMessage, inviteUrl, parseInviteUsername } from '@/lib/links'
import { useAddFriend, useProfile, useUnblockUser, useUserCard } from '@/lib/queries'
import { createStyles, radii, spacing, type, useTheme } from '@/theme'

const pendingInvites = createPendingInvites(kv)

function close() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

function SignedInCard({ myId, username }: { myId: string; username: string }) {
  const styles = useStyles()
  const toast = useToast()
  const card = useUserCard(username)
  const addFriend = useAddFriend(myId)
  const unblock = useUnblockUser()
  const { open, sheet } = useSailorActions(myId)

  if (card.isLoading) return <Loading />
  if (card.isError) {
    return (
      <EmptyState icon="🌊" title="Lost at sea" message={`Couldn’t look up @${username}. Check your connection and try again.`}>
        <Button title="Try again" variant="secondary" onPress={() => card.refetch()} loading={card.isFetching} />
      </EmptyState>
    )
  }
  const user = card.data
  if (!user) {
    return (
      <EmptyState icon="🏝️" title={`No sailor named @${username}`} message="Check the link, or search for them by username.">
        <Button title="Done" variant="secondary" onPress={close} />
      </EmptyState>
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
        <Text style={styles.username} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
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
  const { colors } = useTheme()
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
        headerTitleStyle: { fontFamily: type.navTitle.fontFamily, fontSize: type.navTitle.fontSize },
      }}
    />
  )

  if (loading) return <Loading />
  if (!username) {
    return (
      <>
        {header}
        <EmptyState icon="🧭" title="That link looks broken" message="Ask your friend to send it again.">
          <Button title="Done" variant="secondary" onPress={close} />
        </EmptyState>
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

const useStyles = createStyles((c) => ({
  content: { flex: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: c.background },
  card: {
    backgroundColor: c.cardBackground,
    borderRadius: radii.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardLabel: { ...type.heading, color: c.onRowMuted },
  username: { ...type.row, fontSize: 32, color: c.onRow },
  badge: { ...type.small, color: c.onRowMuted },
}))
