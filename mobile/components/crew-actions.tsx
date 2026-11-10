// Remove / Block / Report for a sailor: long-press on a crew row, or the
// "More" button on the add/<username> screen.

import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert } from 'react-native'

import { ActionSheet, type SheetAction } from '@/components/action-sheet'
import { useToast } from '@/components/toast'
import { useBlockUser, useRemoveFriend } from '@/lib/queries'

export interface Sailor {
  id: string
  username: string
}

export function useSailorActions(myId: string) {
  const toast = useToast()
  const remove = useRemoveFriend(myId)
  const block = useBlockUser(myId)
  const [target, setTarget] = useState<{ sailor: Sailor; inCrew: boolean } | null>(null)

  const confirmRemove = useCallback(
    (s: Sailor) =>
      Alert.alert(`Remove @${s.username}?`, 'You’ll stop being able to hail each other. You can add them again later.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            remove.mutateAsync(s.id).then(
              () => toast(`@${s.username} left your crew`),
              () => toast('Lost at sea — try again')
            ),
        },
      ]),
    [remove, toast]
  )

  const confirmBlock = useCallback(
    (s: Sailor) =>
      Alert.alert(
        `Block @${s.username}?`,
        'They’ll be removed from your crew and won’t be able to find you, add you or hail you. They aren’t told. You can unblock in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () =>
              block.mutateAsync(s.id).then(
                () => toast(`@${s.username} blocked`),
                () => toast('Lost at sea — try again')
              ),
          },
        ]
      ),
    [block, toast]
  )

  const report = useCallback(
    (s: Sailor) => router.push({ pathname: '/report', params: { id: s.id, username: s.username } }),
    []
  )

  const open = useCallback((sailor: Sailor, opts: { inCrew: boolean }) => setTarget({ sailor, ...opts }), [])

  const actions: SheetAction[] = target
    ? [
        ...(target.inCrew ? [{ label: 'Remove from crew', onPress: () => confirmRemove(target.sailor) }] : []),
        { label: 'Block', destructive: true, onPress: () => confirmBlock(target.sailor) },
        { label: 'Report', destructive: true, onPress: () => report(target.sailor) },
      ]
    : []

  const sheet = (
    <ActionSheet
      visible={!!target}
      title={target ? `@${target.sailor.username}` : undefined}
      actions={actions}
      onClose={() => setTarget(null)}
    />
  )

  return { open, sheet }
}
