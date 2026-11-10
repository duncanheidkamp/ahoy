// Port of getBadge() in the PWA's lib/utils/index.ts. Tiers are based on the
// friend's lifetime total of ahoys sent (get_friend_badges().total_sent).

export type BadgeTier = 'sailor' | 'first_mate' | 'captain' | 'admiral'

export interface Badge {
  tier: BadgeTier
  label: string
  icon: string
  threshold: number
}

/** Highest tier first. */
export const BADGE_TIERS: readonly Badge[] = [
  { tier: 'admiral', label: 'Admiral', icon: '⚓', threshold: 10000 },
  { tier: 'captain', label: 'Captain', icon: '🛞', threshold: 1000 },
  { tier: 'first_mate', label: 'First Mate', icon: '🧭', threshold: 500 },
  { tier: 'sailor', label: 'Sailor', icon: '⚓', threshold: 100 },
]

export function getBadge(count: number | null | undefined): Badge | null {
  const n = typeof count === 'number' && Number.isFinite(count) ? count : 0
  return BADGE_TIERS.find((b) => n >= b.threshold) ?? null
}
