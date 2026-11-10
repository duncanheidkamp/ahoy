import { describe, expect, it } from '@jest/globals'
import { normalizeUsername, validateUsername } from '@/lib/username'

describe('validateUsername (mirrors users.username constraints)', () => {
  it.each(['abc', 'duncan', 'a_b_c', 'user_123', '___', 'a'.repeat(20), '123'])('accepts %p', (name) => {
    expect(validateUsername(name)).toEqual({ valid: true })
  })

  it.each([
    ['', 'Username is required'],
    ['ab', 'at least 3'],
    ['a'.repeat(21), 'at most 20'],
    ['Duncan', 'lowercase'],
    ['dun can', 'lowercase'],
    ['dun-can', 'lowercase'],
    ['dun.can', 'lowercase'],
    ['émile', 'lowercase'],
    ['ahoy!', 'lowercase'],
  ])('rejects %p', (name, fragment) => {
    const result = validateUsername(name)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error.toLowerCase()).toContain(fragment.toLowerCase())
  })

  it('normalizes typed input to the server form', () => {
    expect(normalizeUsername('  Captain_Duncan ')).toBe('captain_duncan')
    expect(validateUsername(normalizeUsername('MATEY'))).toEqual({ valid: true })
  })
})
