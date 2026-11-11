import { describe, expect, it } from '@jest/globals'

import { memoryStore } from '@/lib/kv'
import {
  autoActivatePhraseId,
  celebrationFor,
  createSeenPhrases,
  newlyUnlocked,
  phraseItems,
  remainingLabel,
  resolveSeen,
  shouldRefetchPhrases,
} from '@/lib/phrases'
import type { Phrase } from '@/lib/types'

// Shape of get_my_phrases() for a user who has sent `sent` ahoys (secret text masked while locked).
function serverPhrases(sent: number, activeId = 1): Phrase[] {
  const seed = [
    { id: 1, text: 'Ahoy!', unlock_at: 0, secret: false, sort: 10 },
    { id: 2, text: 'Arrrggggg Matey!', unlock_at: 500, secret: false, sort: 20 },
    { id: 3, text: 'Yo!', unlock_at: 1000, secret: true, sort: 30 },
    { id: 4, text: 'Ope!', unlock_at: 2000, secret: false, sort: 40 },
  ]
  return seed.map((p) => ({
    ...p,
    text: p.secret && p.unlock_at > sent ? '???' : p.text,
    unlocked: p.unlock_at <= sent,
    active: p.id === activeId,
  }))
}

describe('phraseItems', () => {
  it('locks with "N more to unlock" and hides the locked secret', () => {
    const items = phraseItems(serverPhrases(120), 120)
    expect(items.map((i) => i.text)).toEqual(['Ahoy!', 'Arrrggggg Matey!', 'Ope!'])
    expect(items[0]).toMatchObject({ unlocked: true, active: true, remaining: 0 })
    expect(items[1]).toMatchObject({ unlocked: false, remaining: 380 })
    expect(remainingLabel(1880)).toBe(`${(1880).toLocaleString()} more to unlock`)
  })

  it('shows Yo! once unlocked', () => {
    const items = phraseItems(serverPhrases(1000), 1000)
    expect(items.find((i) => i.id === 3)).toMatchObject({ text: 'Yo!', unlocked: true })
  })

  it('never shows a negative remaining count', () => {
    // cache bumped past the threshold before the server confirmed
    expect(phraseItems(serverPhrases(499), 600)[1].remaining).toBe(0)
  })
})

describe('shouldRefetchPhrases', () => {
  it('refetches when the local count reaches a locked threshold (secret too)', () => {
    expect(shouldRefetchPhrases(serverPhrases(499), 499)).toBe(false)
    expect(shouldRefetchPhrases(serverPhrases(499), 500)).toBe(true)
    expect(shouldRefetchPhrases(serverPhrases(999), 1000)).toBe(true)
    expect(shouldRefetchPhrases(undefined, 5000)).toBe(false)
  })
})

describe('unlock celebrations', () => {
  it('nothing for a new user (Ahoy! is the default, never celebrated)', () => {
    expect(newlyUnlocked(serverPhrases(0), [])).toEqual([])
  })

  it('celebrates each new unlock once, lowest first', async () => {
    const seen = createSeenPhrases(memoryStore(), 'u1')
    let rows = serverPhrases(500)
    expect(newlyUnlocked(rows, await seen.get()).map((p) => p.id)).toEqual([2])
    await seen.add(2)
    expect(newlyUnlocked(rows, await seen.get())).toEqual([])

    rows = serverPhrases(2000)
    expect(newlyUnlocked(rows, await seen.get()).map((p) => p.id)).toEqual([3, 4])
  })

  it('Yo! (secret) gets the full-screen reveal; others the modal', () => {
    const rows = serverPhrases(1000)
    expect(celebrationFor(rows[2]).kind).toBe('yo-reveal')
    expect(celebrationFor(rows[1]).kind).toBe('unlocked')
  })

  it('a masked (still locked) secret is never celebrated', () => {
    expect(newlyUnlocked(serverPhrases(999), [2]).map((p) => p.id)).toEqual([])
  })

  it('seen unlocks are per user', async () => {
    const store = memoryStore()
    await createSeenPhrases(store, 'alice').add(2)
    expect(await createSeenPhrases(store, 'bob').get()).toEqual([])
    expect(await createSeenPhrases(store, 'alice').get()).toEqual([2])
  })

  it('adding twice keeps one entry; junk in storage is ignored', async () => {
    const store = memoryStore({ 'ahoy.phrases.seen.u': ['x', 2, null] })
    const seen = createSeenPhrases(store, 'u')
    expect(await seen.get()).toEqual([2])
    expect(await seen.add(2)).toEqual([2])
  })
})

describe('Yo! becomes your active phrase when unlocked', () => {
  it('the Yo! reveal auto-activates Yo!; regular unlocks only offer "Use it"', () => {
    const rows = serverPhrases(1000)
    expect(autoActivatePhraseId(celebrationFor(rows[2]))).toBe(3)
    expect(autoActivatePhraseId(celebrationFor(rows[1]))).toBeNull()
    expect(autoActivatePhraseId(null)).toBeNull()
  })
})

describe('new device baseline (no seen record yet)', () => {
  // Mirrors PhraseCelebrationHost: read the record, resolve, persist a baseline, then queue.
  async function celebrationsOn(store: ReturnType<typeof memoryStore>, rows: ReturnType<typeof serverPhrases>) {
    const seenStore = createSeenPhrases(store, 'u1')
    const { seen, baseline } = resolveSeen(await seenStore.read(), rows)
    if (seen && baseline) await seenStore.setAll(seen)
    return seen ? newlyUnlocked(rows, seen).map((p) => p.id) : []
  }

  it('waits for the server list before deciding anything', () => {
    expect(resolveSeen(null, undefined)).toEqual({ seen: null, baseline: false })
  })

  it('marks everything already unlocked as seen without celebrating — Yo! included', async () => {
    const store = memoryStore()
    const rows = serverPhrases(1200, 3) // has Arrr + Yo!, Yo! active from the old phone
    expect(resolveSeen(null, rows)).toEqual({ seen: [2, 3], baseline: true })
    expect(await celebrationsOn(store, rows)).toEqual([])
    expect(store.data['ahoy.phrases.seen.u1']).toEqual([2, 3])
    // and no reveal means no auto-switch either
    expect(autoActivatePhraseId(null)).toBeNull()
  })

  it('celebrates only unlocks that happen after the baseline', async () => {
    const store = memoryStore()
    expect(await celebrationsOn(store, serverPhrases(1200))).toEqual([])
    expect(await celebrationsOn(store, serverPhrases(2000))).toEqual([4])
  })

  it('a brand-new user gets an empty baseline, so their first unlock is celebrated', async () => {
    const store = memoryStore()
    expect(await celebrationsOn(store, serverPhrases(0))).toEqual([])
    expect(store.data['ahoy.phrases.seen.u1']).toEqual([])
    expect(await celebrationsOn(store, serverPhrases(500))).toEqual([2])
  })

  it('an existing record is used as-is (no new baseline)', async () => {
    const store = memoryStore({ 'ahoy.phrases.seen.u1': [] })
    expect(resolveSeen([], serverPhrases(500))).toEqual({ seen: [], baseline: false })
    expect(await celebrationsOn(store, serverPhrases(500))).toEqual([2])
  })

  it('the baseline is per user on the device', async () => {
    const store = memoryStore({ 'ahoy.phrases.seen.alice': [2] })
    expect(await createSeenPhrases(store, 'bob').read()).toBeNull()
    expect(await createSeenPhrases(store, 'alice').read()).toEqual([2])
  })
})
