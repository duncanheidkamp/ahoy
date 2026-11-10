import { describe, expect, it } from '@jest/globals'
import {
  IDLE,
  SENT_HOLD_MS,
  classifySendError,
  rowLabel,
  sendFailureMessage,
  transition,
  type SendEvent,
  type SendState,
} from '@/lib/send-machine'

const run = (events: SendEvent[], start: SendState = IDLE) => {
  let state = start
  const effects: string[] = []
  for (const e of events) {
    const r = transition(state, e)
    state = r.state
    effects.push(...r.effects.map((x) => (x.type === 'toast' ? `toast:${x.message}` : x.type)))
  }
  return { state, effects }
}

describe('send state machine', () => {
  it('flips to the phrase instantly with a haptic and one send', () => {
    const { state, effects } = run([{ type: 'tap', phrase: 'Ahoy!' }])
    expect(state).toEqual({ status: 'sending', phrase: 'Ahoy!' })
    expect(effects).toEqual(['hapticTap', 'send'])
    expect(rowLabel(state, 'marek')).toBe('AHOY!')
  })

  it('ignores a second tap while sending (double tap sends once)', () => {
    const { effects } = run([
      { type: 'tap', phrase: 'Ahoy!' },
      { type: 'tap', phrase: 'Ahoy!' },
      { type: 'tap', phrase: 'Ahoy!' },
    ])
    expect(effects.filter((e) => e === 'send')).toHaveLength(1)
  })

  it('holds the sent state for ~1.5s, then reverts to the username', () => {
    const r1 = transition({ status: 'sending', phrase: 'Ahoy!' }, { type: 'succeeded', phrase: 'Ahoy!' })
    expect(r1.state).toEqual({ status: 'sent', phrase: 'Ahoy!' })
    expect(r1.effects).toEqual([{ type: 'scheduleReset', ms: SENT_HOLD_MS }])
    expect(SENT_HOLD_MS).toBe(1500)
    // Taps during the hold are ignored too.
    expect(transition(r1.state, { type: 'tap', phrase: 'Ahoy!' }).effects).toEqual([])
    const r2 = transition(r1.state, { type: 'reset' })
    expect(r2.state).toEqual(IDLE)
    expect(rowLabel(r2.state, 'marek')).toBe('MAREK')
  })

  it("uses the server's phrase if it differs from the optimistic one", () => {
    const r = transition({ status: 'sending', phrase: 'Ahoy!' }, { type: 'succeeded', phrase: 'Avast!' })
    expect(r.state).toEqual({ status: 'sent', phrase: 'Avast!' })
    const keep = transition({ status: 'sending', phrase: 'Ahoy!' }, { type: 'succeeded', phrase: null })
    expect(keep.state).toEqual({ status: 'sent', phrase: 'Ahoy!' })
  })

  it('reverts with a themed toast and error haptic on failure', () => {
    const { state, effects } = run([
      { type: 'tap', phrase: 'Ahoy!' },
      { type: 'failed', failure: 'rate_limited' },
    ])
    expect(state).toEqual(IDLE)
    expect(effects).toEqual(['hapticTap', 'send', 'hapticError', 'toast:Easy, matey — slow down'])
  })

  it('can send again after a failure', () => {
    const { effects } = run([
      { type: 'tap', phrase: 'Ahoy!' },
      { type: 'failed', failure: 'network' },
      { type: 'tap', phrase: 'Ahoy!' },
    ])
    expect(effects.filter((e) => e === 'send')).toHaveLength(2)
  })

  it('ignores stray events', () => {
    expect(transition(IDLE, { type: 'succeeded' }).state).toBe(IDLE)
    expect(transition(IDLE, { type: 'failed', failure: 'unknown' }).effects).toEqual([])
    expect(transition(IDLE, { type: 'reset' }).state).toBe(IDLE)
    const sending: SendState = { status: 'sending', phrase: 'x' }
    expect(transition(sending, { type: 'reset' }).state).toBe(sending)
  })
})

describe('send error mapping', () => {
  it.each([
    [{ status: 403, code: 'not_friends' }, 'not_friends', "That sailor isn't in your crew"],
    [{ status: 403, code: null }, 'not_friends', "That sailor isn't in your crew"],
    [{ status: 429, code: 'rate_limited' }, 'rate_limited', 'Easy, matey — slow down'],
    [{ status: 429 }, 'rate_limited', 'Easy, matey — slow down'],
    [{ status: 401, code: 'unauthorized' }, 'unauthorized', 'Your session expired — log in again'],
    [{ status: 500, code: 'send_failed' }, 'unknown', 'Lost at sea — try again'],
    [{ status: 400, code: 'receiver_id required' }, 'unknown', 'Lost at sea — try again'],
    [{ status: null }, 'network', 'Lost at sea — try again'],
  ] as const)('%p -> %p', (info, failure, message) => {
    const f = classifySendError(info)
    expect(f).toBe(failure)
    expect(sendFailureMessage(f)).toBe(message)
  })
})
