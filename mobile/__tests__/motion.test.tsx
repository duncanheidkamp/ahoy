import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { act, renderHook } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { useMoments } from '@/components/motion'
import { durations, moments } from '@/lib/motion'
import { motion } from '@/theme'

// Only useReducedMotion is needed; the real module wants the native worklets runtime.
jest.mock('react-native-reanimated', () => ({ useReducedMotion: jest.fn(() => false) }))

describe('moments', () => {
  it('full motion: wave sweeps, phrase scales in, overlays slide', () => {
    const m = moments(false)
    expect(m.ripple.kind).toBe('sweep')
    expect(m.flash).toMatchObject({ kind: 'scale' })
    expect(m.flash.fromScale).toBeLessThan(1)
    expect(m.reveal.kind).toBe('scale')
    expect(m.overlay.kind).toBe('slide')
    expect(m.overlay.offset).toBeGreaterThan(0)
  })

  it('Reduce Motion: every moment falls back to a plain fade — no movement or scaling', () => {
    const m = moments(true)
    expect(m.reduced).toBe(true)
    expect(m.ripple.kind).toBe('fade')
    expect(m.flash).toMatchObject({ kind: 'fade', fromScale: 1 })
    expect(m.reveal).toMatchObject({ kind: 'fade', fromScale: 1 })
    expect(m.overlay).toMatchObject({ kind: 'fade', offset: 0 })
  })

  it.each([false, true])('every animation is <= 300 ms (reduce motion: %s)', (reduced) => {
    for (const ms of durations(moments(reduced))) {
      expect(ms).toBeGreaterThan(0)
      expect(ms).toBeLessThanOrEqual(motion.max)
    }
  })
})

describe('useMoments follows the OS Reduce Motion setting', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  function mockSystem(initial: boolean) {
    let listener: ((v: boolean) => void) | undefined
    jest.mocked(useReducedMotion).mockReturnValue(initial)
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(initial)
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_: string, l: (v: boolean) => void) => {
      listener = l
      return { remove: () => {} }
    }) as never)
    return (v: boolean) => listener?.(v)
  }

  it('uses the fade fallback when Reduce Motion is on', async () => {
    mockSystem(true)
    const { result } = await renderHook(() => useMoments())
    expect(result.current.reduced).toBe(true)
    expect(result.current.ripple.kind).toBe('fade')
  })

  it('full motion when off, and switches live when the user flips the setting', async () => {
    const flip = mockSystem(false)
    const { result } = await renderHook(() => useMoments())
    expect(result.current.ripple.kind).toBe('sweep')
    await act(async () => flip(true))
    expect(result.current.ripple.kind).toBe('fade')
  })
})
