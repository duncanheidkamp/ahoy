import { describe, expect, it } from '@jest/globals'
import { createTapGuard } from '@/lib/debounce'

describe('createTapGuard', () => {
  it('lets the first tap through and drops taps inside the window', () => {
    let t = 1000
    const guard = createTapGuard(400, () => t)
    expect(guard.tryAcquire()).toBe(true)
    t += 50
    expect(guard.tryAcquire()).toBe(false)
    t += 300
    expect(guard.tryAcquire()).toBe(false)
    t += 60 // 410ms after the first tap
    expect(guard.tryAcquire()).toBe(true)
  })

  it('a burst of 10 taps in 100ms passes once', () => {
    let t = 0
    const guard = createTapGuard(400, () => t)
    let passed = 0
    for (let i = 0; i < 10; i++) {
      if (guard.tryAcquire()) passed++
      t += 10
    }
    expect(passed).toBe(1)
  })

  it('reset reopens the guard', () => {
    const guard = createTapGuard(400, () => 0)
    expect(guard.tryAcquire()).toBe(true)
    expect(guard.tryAcquire()).toBe(false)
    guard.reset()
    expect(guard.tryAcquire()).toBe(true)
  })
})
