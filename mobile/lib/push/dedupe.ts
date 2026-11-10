// "Handle each notification response once", across every way one can reach
// us: the response listener, getLastNotificationResponseAsync() on cold start
// or foreground, and (Android) the headless background task — which may run in
// a separate JS runtime, hence the persisted list.
//
// claim() is check-and-set. The in-memory set makes it synchronous within one
// runtime (listener and cold-start lookup can fire in the same tick).

import type { JsonStore } from '../kv'
import { STORAGE_KEYS } from './constants'

export const MAX_REMEMBERED = 50

export function createDedupe(store: JsonStore, key: string = STORAGE_KEYS.handledResponses) {
  const seen = new Set<string>()
  let queue: Promise<unknown> = Promise.resolve()

  async function persist(id: string): Promise<boolean> {
    const list = (await store.get<string[]>(key)) ?? []
    if (list.includes(id)) return false
    const next = [...list, id].slice(-MAX_REMEMBERED)
    await store.set(key, next)
    return true
  }

  return {
    /** Resolves true exactly once per id. */
    claim(id: string): Promise<boolean> {
      if (seen.has(id)) return Promise.resolve(false)
      seen.add(id)
      // Serialise read-modify-write so two claims can't both miss each other.
      const result = queue.then(() => persist(id)).catch(() => true)
      queue = result
      return result
    },
  }
}

export type Dedupe = ReturnType<typeof createDedupe>
