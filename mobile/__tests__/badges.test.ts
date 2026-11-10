import { describe, expect, it } from '@jest/globals'
import { getBadge } from '@/lib/badges'

describe('getBadge (port of PWA lib/utils getBadge)', () => {
  it.each([
    [0, null],
    [99, null],
    [100, 'Sailor'],
    [499, 'Sailor'],
    [500, 'First Mate'],
    [999, 'First Mate'],
    [1000, 'Captain'],
    [9999, 'Captain'],
    [10000, 'Admiral'],
    [250000, 'Admiral'],
  ])('%p ahoys -> %p', (count, label) => {
    expect(getBadge(count)?.label ?? null).toBe(label)
  })

  it('treats missing / bad values as zero', () => {
    expect(getBadge(undefined)).toBeNull()
    expect(getBadge(null)).toBeNull()
    expect(getBadge(Number.NaN)).toBeNull()
  })

  it('keeps the PWA icons', () => {
    expect(getBadge(100)?.icon).toBe('⚓')
    expect(getBadge(500)?.icon).toBe('🧭')
    expect(getBadge(1000)?.icon).toBe('🛞')
    expect(getBadge(10000)?.icon).toBe('⚓')
  })
})
