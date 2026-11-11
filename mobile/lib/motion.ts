// The app's animated moments, as plain data so the Reduce Motion fallback is
// testable. Components read these through useMotion() (components/motion.ts),
// which supplies the OS "Reduce Motion" setting.
//
// Rules: nothing runs longer than motion.max (300 ms); with Reduce Motion on,
// nothing moves or scales — every moment becomes a short opacity fade.

import { motion } from '@/theme'

export interface Moments {
  reduced: boolean
  /** Wave across a crew row on send: a crest sweeping left to right, or a flash of foam. */
  ripple: { kind: 'sweep' | 'fade'; duration: number; peakOpacity: number }
  /** The phrase replacing the name on send. */
  flash: { kind: 'scale' | 'fade'; duration: number; fromScale: number }
  /** Unlock dialog / Yo! reveal text. */
  reveal: { kind: 'scale' | 'fade'; duration: number; fromScale: number }
  /** Toasts and the in-app banner: slide + fade, or fade only. */
  overlay: { kind: 'slide' | 'fade'; inDuration: number; outDuration: number; offset: number }
}

export function moments(reduceMotion: boolean): Moments {
  if (reduceMotion) {
    return {
      reduced: true,
      ripple: { kind: 'fade', duration: motion.base, peakOpacity: 0.6 },
      flash: { kind: 'fade', duration: motion.fast, fromScale: 1 },
      reveal: { kind: 'fade', duration: motion.base, fromScale: 1 },
      overlay: { kind: 'fade', inDuration: motion.fast, outDuration: motion.base, offset: 0 },
    }
  }
  return {
    reduced: false,
    ripple: { kind: 'sweep', duration: motion.slow, peakOpacity: 1 },
    flash: { kind: 'scale', duration: motion.base, fromScale: 0.6 },
    reveal: { kind: 'scale', duration: motion.slow, fromScale: 0.4 },
    overlay: { kind: 'slide', inDuration: motion.base, outDuration: motion.base, offset: 16 },
  }
}

/** Every duration in a Moments value (for the <= 300 ms rule). */
export function durations(m: Moments): number[] {
  return [m.ripple.duration, m.flash.duration, m.reveal.duration, m.overlay.inDuration, m.overlay.outDuration]
}
