// Phrase picker + unlock celebrations. The server (get_my_phrases /
// set_active_phrase / record_ahoy) is the source of truth for what is
// unlocked; this device only remembers which unlocks it has already
// celebrated, per user.

import type { JsonStore } from './kv'
import type { Phrase } from './types'

export const DEFAULT_PHRASE = 'Ahoy!'

export interface PhraseItem {
  id: number
  text: string
  unlocked: boolean
  active: boolean
  unlockAt: number
  /** Ahoys still to send before it unlocks (0 once unlocked). */
  remaining: number
}

/** Visible picker rows. Locked secret phrases (Yo!) are hidden entirely. */
export function phraseItems(rows: readonly Phrase[], totalSent: number): PhraseItem[] {
  return rows
    .filter((p) => p.unlocked || !p.secret)
    .map((p) => ({
      id: p.id,
      text: p.text,
      unlocked: p.unlocked,
      active: p.active,
      unlockAt: p.unlock_at,
      remaining: p.unlocked ? 0 : Math.max(0, p.unlock_at - totalSent),
    }))
}

export function remainingLabel(remaining: number): string {
  return `${remaining.toLocaleString()} more to unlock`
}

/**
 * The cached list is stale if the (locally bumped) sent count has reached a
 * locked phrase's threshold: refetch so the server confirms the unlock.
 * Works for secret phrases too (their unlock_at is visible, only the text is
 * masked).
 */
export function shouldRefetchPhrases(rows: readonly Phrase[] | undefined, totalSent: number): boolean {
  return !!rows?.some((p) => !p.unlocked && p.unlock_at <= totalSent)
}

/**
 * Unlocked phrases this device hasn't celebrated yet, lowest threshold first.
 * The default phrase (unlock_at 0) is never celebrated.
 */
export function newlyUnlocked(rows: readonly Phrase[] | undefined, seen: readonly number[]): Phrase[] {
  if (!rows) return []
  return rows
    .filter((p) => p.unlocked && p.unlock_at > 0 && !seen.includes(p.id))
    .sort((a, b) => a.unlock_at - b.unlock_at || a.sort - b.sort)
}

export type Celebration = { kind: 'yo-reveal'; phrase: Phrase } | { kind: 'unlocked'; phrase: Phrase }

/** Secret phrases get the full-screen reveal (the PWA's "Yo!"), others the modal. */
export function celebrationFor(phrase: Phrase): Celebration {
  return phrase.secret ? { kind: 'yo-reveal', phrase } : { kind: 'unlocked', phrase }
}

/**
 * The phrase a celebration switches you to on its own, if any. Like the PWA,
 * unlocking the secret Yo! makes it your active phrase; regular unlocks only
 * offer "Use it".
 */
export function autoActivatePhraseId(celebration: Celebration | null): number | null {
  return celebration?.kind === 'yo-reveal' ? celebration.phrase.id : null
}

/**
 * Which unlocks this device has "seen", given what's stored.
 *
 * A device with no record yet for this user (fresh install, new phone, or a
 * reinstall) takes a silent baseline: everything already unlocked counts as
 * seen, so old unlocks — Yo! included — are never replayed. Only unlocks
 * after the baseline are celebrated. Needs the server's phrase list; until it
 * has loaded, nothing is decided (`seen: null`).
 */
export function resolveSeen(
  stored: readonly number[] | null,
  rows: readonly Phrase[] | undefined
): { seen: number[] | null; baseline: boolean } {
  if (stored) return { seen: [...stored], baseline: false }
  if (!rows) return { seen: null, baseline: false }
  return { seen: rows.filter((p) => p.unlocked && p.unlock_at > 0).map((p) => p.id), baseline: true }
}

export const seenPhrasesKey = (userId: string) => `ahoy.phrases.seen.${userId}`

export function createSeenPhrases(store: JsonStore, userId: string) {
  const key = seenPhrasesKey(userId)
  const read = async (): Promise<number[] | null> => {
    const value = await store.get<unknown>(key)
    return Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : null
  }
  return {
    /** Seen ids, or null if this device has no record for the user yet. */
    read,
    async get(): Promise<number[]> {
      return (await read()) ?? []
    },
    /** Saves the new-device baseline (see resolveSeen). */
    async setAll(ids: readonly number[]): Promise<number[]> {
      const next = [...new Set(ids)]
      await store.set(key, next)
      return next
    },
    async add(id: number): Promise<number[]> {
      const current = await this.get()
      const next = current.includes(id) ? current : [...current, id]
      await store.set(key, next)
      return next
    },
  }
}
