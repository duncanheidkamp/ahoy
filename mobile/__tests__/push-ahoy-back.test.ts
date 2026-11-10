import { describe, expect, it, jest } from '@jest/globals'

import { memoryStore } from '@/lib/kv'
import { createAhoyBackQueue, PENDING_MAX_AGE_MS, type SendOutcome } from '@/lib/push/ahoy-back'

const intent = (key: string) => ({ key, senderId: `s-${key}`, senderUsername: `u${key}` })

describe('ahoy-back queue', () => {
  it('records the intent before sending and clears it on success', async () => {
    const store = memoryStore()
    let seenDuringSend: unknown = null
    const q = createAhoyBackQueue({
      store,
      send: async () => {
        seenDuringSend = await q.pending()
        return { ok: true }
      },
    })
    expect(await q.attempt(intent('1'))).toBe('sent')
    expect(seenDuringSend).toHaveLength(1)
    expect(await q.pending()).toEqual([])
  })

  it('keeps retryable failures and sends them on flush', async () => {
    const results: SendOutcome[] = [{ ok: false, failure: 'network' }, { ok: true }]
    const send = jest.fn(() => Promise.resolve(results.shift()!))
    const q = createAhoyBackQueue({ store: memoryStore(), send })
    expect(await q.attempt(intent('1'))).toBe('queued')
    const sent = await q.flush()
    expect(sent.map((s) => s.senderUsername)).toEqual(['u1'])
    expect(await q.pending()).toEqual([])
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('treats a thrown send (e.g. suspended mid-request) as retryable', async () => {
    const q = createAhoyBackQueue({ store: memoryStore(), send: () => Promise.reject(new Error('aborted')) })
    expect(await q.attempt(intent('1'))).toBe('queued')
  })

  it('drops business refusals and signed-out', async () => {
    for (const failure of ['not_friends', 'rate_limited', 'signed_out'] as const) {
      const q = createAhoyBackQueue({ store: memoryStore(), send: () => Promise.resolve({ ok: false, failure }) })
      expect(await q.attempt(intent('1'))).toBe('dropped')
      expect(await q.pending()).toEqual([])
    }
  })

  it('drops stale intents instead of sending them late', async () => {
    let now = 1_000_000
    const send = jest.fn<() => Promise<SendOutcome>>(() => Promise.resolve({ ok: false, failure: 'network' }))
    const q = createAhoyBackQueue({ store: memoryStore(), send, now: () => now })
    await q.attempt(intent('1'))
    now += PENDING_MAX_AGE_MS + 1
    send.mockResolvedValue({ ok: true })
    expect(await q.flush()).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    expect(await q.pending()).toEqual([])
  })

  it('a flush during an in-flight attempt does not double-send', async () => {
    let release!: (o: SendOutcome) => void
    const send = jest.fn(() => new Promise<SendOutcome>((r) => (release = r)))
    const q = createAhoyBackQueue({ store: memoryStore(), send })
    const attempt = q.attempt(intent('1'))
    await new Promise((r) => setTimeout(r, 0))
    const flushed = await q.flush()
    release({ ok: true })
    expect(await attempt).toBe('sent')
    expect(flushed).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('the same intent is queued once', async () => {
    const store = memoryStore()
    const q = createAhoyBackQueue({ store, send: () => Promise.resolve({ ok: false, failure: 'network' }) })
    await q.attempt(intent('1'))
    await q.attempt(intent('1'))
    expect(await q.pending()).toHaveLength(1)
  })
})
