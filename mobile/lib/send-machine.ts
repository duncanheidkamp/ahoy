// Optimistic send state for one crew row, as a pure transition function.
//
//   idle --tap--> sending --succeeded--> sent --reset (after SENT_HOLD_MS)--> idle
//                    \--failed--> idle (+ themed toast, error haptic)
//
// The row shows the active phrase in caps while `sending` and `sent`, so the
// flip is instant. Taps while sending/sent are ignored, which is what makes a
// rapid double tap send once.

export const SENT_HOLD_MS = 1500

export type SendFailure = 'not_friends' | 'rate_limited' | 'unauthorized' | 'network' | 'unknown'

export type SendState =
  | { status: 'idle' }
  | { status: 'sending'; phrase: string }
  | { status: 'sent'; phrase: string }

export type SendEvent =
  | { type: 'tap'; phrase: string }
  | { type: 'succeeded'; phrase?: string | null }
  | { type: 'failed'; failure: SendFailure }
  | { type: 'reset' }

export type SendEffect =
  | { type: 'send' }
  | { type: 'hapticTap' }
  | { type: 'hapticError' }
  | { type: 'scheduleReset'; ms: number }
  | { type: 'toast'; message: string }

export const IDLE: SendState = { status: 'idle' }

export function transition(state: SendState, event: SendEvent): { state: SendState; effects: SendEffect[] } {
  switch (event.type) {
    case 'tap':
      if (state.status !== 'idle') return { state, effects: [] }
      return {
        state: { status: 'sending', phrase: event.phrase },
        effects: [{ type: 'hapticTap' }, { type: 'send' }],
      }
    case 'succeeded':
      if (state.status !== 'sending') return { state, effects: [] }
      return {
        // Trust the server's phrase (it is the source of truth) if it differs.
        state: { status: 'sent', phrase: event.phrase || state.phrase },
        effects: [{ type: 'scheduleReset', ms: SENT_HOLD_MS }],
      }
    case 'failed':
      if (state.status !== 'sending') return { state, effects: [] }
      return {
        state: IDLE,
        effects: [{ type: 'hapticError' }, { type: 'toast', message: sendFailureMessage(event.failure) }],
      }
    case 'reset':
      if (state.status !== 'sent') return { state, effects: [] }
      return { state: IDLE, effects: [] }
  }
}

/** What the row says right now. */
export function rowLabel(state: SendState, username: string): string {
  return state.status === 'idle' ? username.toUpperCase() : state.phrase.toUpperCase()
}

export function sendFailureMessage(failure: SendFailure): string {
  switch (failure) {
    case 'not_friends':
      return "That sailor isn't in your crew"
    case 'rate_limited':
      return 'Easy, matey — slow down'
    case 'unauthorized':
      return 'Your session expired — log in again'
    case 'network':
    case 'unknown':
      return 'Lost at sea — try again'
  }
}

/**
 * Maps a send-ahoy response to a failure kind. The Edge Function returns
 * 401 unauthorized, 400 invalid, 403 { error: 'not_friends' } (also used for
 * blocks), 429 { error: 'rate_limited' }.
 */
export function classifySendError(info: { status?: number | null; code?: string | null }): SendFailure {
  if (info.code === 'not_friends' || info.status === 403) return 'not_friends'
  if (info.code === 'rate_limited' || info.status === 429) return 'rate_limited'
  if (info.status === 401) return 'unauthorized'
  if (info.status == null) return 'network'
  return 'unknown'
}
