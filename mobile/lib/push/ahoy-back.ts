// "Ahoy back!" delivery with a fallback queue.
//
// attempt(): record the intent FIRST, then send. If the send can't complete —
// no network, the OS suspended us mid-request, the refresh token couldn't be
// used — the intent stays queued and flush() sends it the next time the app
// is in the foreground (and the app shows a toast). Business refusals
// (not_friends, rate_limited) are dropped: retrying wouldn't help.

import type { JsonStore } from '../kv'
import type { SendFailure } from '../send-machine'
import { STORAGE_KEYS } from './constants'

/** Queued intents older than this are dropped rather than sent late. */
export const PENDING_MAX_AGE_MS = 15 * 60_000

export interface PendingAhoyBack {
  key: string
  senderId: string
  senderUsername: string
  at: number
}

export type SendOutcome = { ok: true } | { ok: false; failure: SendFailure | 'signed_out' }

export interface AhoyBackDeps {
  store: JsonStore
  /** Refreshes the session if needed, then calls send-ahoy. */
  send(receiverId: string): Promise<SendOutcome>
  now?: () => number
}

const RETRYABLE: ReadonlySet<string> = new Set(['network', 'unknown', 'unauthorized'])

export type AttemptResult = 'sent' | 'queued' | 'dropped'

export function createAhoyBackQueue({ store, send, now = Date.now }: AhoyBackDeps) {
  const key = STORAGE_KEYS.pendingAhoyBacks
  let lock: Promise<unknown> = Promise.resolve()
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = lock.then(fn, fn)
    lock = run.catch(() => undefined)
    return run
  }

  const read = async () => (await store.get<PendingAhoyBack[]>(key)) ?? []
  const write = (items: PendingAhoyBack[]) => (items.length ? store.set(key, items) : store.remove(key))

  async function removeKey(k: string) {
    await serial(async () => write((await read()).filter((p) => p.key !== k)))
  }

  // A foreground flush must not re-send an intent whose first attempt is
  // still in flight in this runtime.
  const inFlight = new Set<string>()

  async function deliver(item: PendingAhoyBack): Promise<AttemptResult | 'busy'> {
    if (inFlight.has(item.key)) return 'busy'
    inFlight.add(item.key)
    try {
      let outcome: SendOutcome
      try {
        outcome = await send(item.senderId)
      } catch {
        outcome = { ok: false, failure: 'network' }
      }
      if (!outcome.ok && outcome.failure !== 'signed_out' && RETRYABLE.has(outcome.failure)) return 'queued'
      await removeKey(item.key)
      return outcome.ok ? 'sent' : 'dropped'
    } finally {
      inFlight.delete(item.key)
    }
  }

  return {
    async attempt(intent: Omit<PendingAhoyBack, 'at'>): Promise<AttemptResult> {
      const item: PendingAhoyBack = { ...intent, at: now() }
      await serial(async () => {
        const items = await read()
        if (!items.some((p) => p.key === item.key)) await write([...items, item])
      })
      const result = await deliver(item)
      return result === 'busy' ? 'queued' : result
    },

    /** Sends whatever is still queued. Returns what was sent (for toasts). */
    async flush(): Promise<PendingAhoyBack[]> {
      const items = await serial(async () => {
        const all = await read()
        const fresh = all.filter((p) => now() - p.at <= PENDING_MAX_AGE_MS)
        if (fresh.length !== all.length) await write(fresh)
        return fresh
      })
      const sent: PendingAhoyBack[] = []
      for (const item of items) {
        if ((await deliver(item)) === 'sent') sent.push(item)
      }
      return sent
    },

    pending: read,
  }
}

export type AhoyBackQueue = ReturnType<typeof createAhoyBackQueue>
