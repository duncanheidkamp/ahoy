// useMoments(): the animated moments (lib/motion.ts) for the current OS
// "Reduce Motion" setting. Reanimated's useReducedMotion() gives the value
// synchronously on first render; AccessibilityInfo keeps it live if the user
// flips the switch while the app is open.

import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { moments, type Moments } from '@/lib/motion'

const cache = { true: moments(true), false: moments(false) }

export function useReduceMotion(): boolean {
  const initial = useReducedMotion()
  const [live, setLive] = useState<boolean | null>(null)
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setLive(v))
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setLive(v))
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])
  return live ?? initial
}

export function useMoments(): Moments {
  return cache[String(useReduceMotion()) as 'true' | 'false']
}
