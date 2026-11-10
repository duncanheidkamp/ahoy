// A declined request must keep looking like "Request sent" to the requester
// (the database keeps declined rows so they can't be re-sent, and only the
// addressee may delete them). "Cancel" on such a row therefore just hides it
// on this device.

import type { JsonStore } from './kv'

export const hiddenRequestsKey = (userId: string) => `ahoy.requests.hidden.${userId}`

export function createHiddenRequests(store: JsonStore, userId: string) {
  const key = hiddenRequestsKey(userId)
  return {
    async get(): Promise<string[]> {
      const value = await store.get<unknown>(key)
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
    },
    async hide(friendshipId: string): Promise<void> {
      const current = await this.get()
      // SecureStore values should stay small; keep the most recent 50.
      await store.set(key, [...current.filter((id) => id !== friendshipId), friendshipId].slice(-50))
    },
  }
}
