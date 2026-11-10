import { describe, expect, it } from '@jest/globals'

import { memoryStore } from '@/lib/kv'
import {
  celebrationFor,
  createSeenPhrases,
  newlyUnlocked,
  phraseItems,
  remainingLabel,
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
