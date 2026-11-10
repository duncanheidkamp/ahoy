import { describe, expect, it } from '@jest/globals'

import { notificationSetting, REOFFER_AFTER_MS, shouldOfferPrePrompt, type PrePromptInput } from '@/lib/push/prompt'

const NOW = 1_800_000_000_000
const base: PrePromptInput = {
  permission: { status: 'undetermined', canAskAgain: true },
  crewCount: 1,
  dismissedAt: null,
  now: NOW,
  offeredThisSession: false,
}

describe('pre-prompt scheduling', () => {
  it('offers once the first crewmate is aboard, not before (not at signup)', () => {
    expect(shouldOfferPrePrompt({ ...base, crewCount: 0 })).toBe(false)
    expect(shouldOfferPrePrompt(base)).toBe(true)
  })

  it('never offers when already granted or when the OS will not ask again', () => {
    expect(shouldOfferPrePrompt({ ...base, permission: { status: 'granted', canAskAgain: true } })).toBe(false)
    expect(shouldOfferPrePrompt({ ...base, permission: { status: 'denied', canAskAgain: false } })).toBe(false)
  })

  it('Android 13 second chance: denied but askable is offered', () => {
    expect(shouldOfferPrePrompt({ ...base, permission: { status: 'denied', canAskAgain: true } })).toBe(true)
  })

  it('"Not now" waits 3 days, then re-offers on a later app open', () => {
    expect(shouldOfferPrePrompt({ ...base, dismissedAt: NOW - 60_000 })).toBe(false)
    expect(shouldOfferPrePrompt({ ...base, dismissedAt: NOW - REOFFER_AFTER_MS + 1 })).toBe(false)
    expect(shouldOfferPrePrompt({ ...base, dismissedAt: NOW - REOFFER_AFTER_MS })).toBe(true)
    expect(REOFFER_AFTER_MS).toBe(3 * 24 * 60 * 60 * 1000)
  })

  it('at most once per app session', () => {
    expect(shouldOfferPrePrompt({ ...base, offeredThisSession: true })).toBe(false)
  })

  it('settings row state', () => {
    expect(notificationSetting({ status: 'granted', canAskAgain: false })).toBe('on')
    expect(notificationSetting({ status: 'undetermined', canAskAgain: true })).toBe('off')
    expect(notificationSetting({ status: 'denied', canAskAgain: false })).toBe('blocked')
  })
})
