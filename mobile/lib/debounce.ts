// Tap debouncing, kept free of React so it can be unit tested.

/**
 * Leading-edge tap guard: the first call within each `windowMs` window passes,
 * later calls in the window are dropped. Used so a rapid double tap on a crew
 * row sends exactly one ahoy.
 */
export function createTapGuard(windowMs: number, now: () => number = Date.now) {
  let last = Number.NEGATIVE_INFINITY
  return {
    /** Returns true if this tap should go through. */
    tryAcquire(): boolean {
      const t = now()
      if (t - last < windowMs) return false
      last = t
      return true
    },
    reset() {
      last = Number.NEGATIVE_INFINITY
    },
  }
}
