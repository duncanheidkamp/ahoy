// Everything this app keeps on the device for a user, so account deletion
// (and logout) can clear it.

import { kv, type JsonStore } from './kv'
import { hiddenRequestsKey } from './hidden-requests'
import { PENDING_LINK_KEY } from './links'
import { seenPhrasesKey } from './phrases'
import { STORAGE_KEYS } from './push/constants'

export function localStateKeys(userId: string): string[] {
  return [
    ...Object.values(STORAGE_KEYS),
    PENDING_LINK_KEY,
    seenPhrasesKey(userId),
    hiddenRequestsKey(userId),
  ]
}

export async function clearLocalState(userId: string, store: JsonStore = kv): Promise<void> {
  await Promise.all(localStateKeys(userId).map((k) => store.remove(k).catch(() => {})))
}
