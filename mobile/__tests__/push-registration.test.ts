import { describe, expect, it, jest } from '@jest/globals'

import { memoryStore } from '@/lib/kv'
import { STORAGE_KEYS } from '@/lib/push/constants'
import { registerForPush, signOutWithPushCleanup, type RegistrationDeps } from '@/lib/push/registration'
import { ensureFreshSession } from '@/lib/push/session'

function deps(overrides: Partial<RegistrationDeps> = {}, log: string[] = []) {
  const store = memoryStore()
  const d: RegistrationDeps = {
    store,
    isDevice: true,
    platform: 'ios',
    deviceName: 'Test iPhone',
    projectId: 'proj-1',
    channelsReady: new Promise<void>((r) =>
      setTimeout(() => {
        log.push('channels')
        r()
      }, 5)
    ),
    isGranted: () => Promise.resolve(true),
    getExpoPushToken: (id) => {
      log.push(`token:${id}`)
      return Promise.resolve('ExponentPushToken[abc]')
    },
    registerToken: (token, platform, name) => {
      log.push(`register:${token}:${platform}:${name}`)
      return Promise.resolve()
    },
    deleteToken: (token) => {
      log.push(`delete:${token}`)
      return Promise.resolve()
    },
    signOut: () => {
      log.push('signOut')
      return Promise.resolve()
    },
    ...overrides,
  }
  return { d, log, store }
}

describe('registerForPush', () => {
  it('waits for Android channels, gets the token with the projectId, upserts via register_push_token', async () => {
    const { d, log, store } = deps()
    expect(await registerForPush(d, 'user-1')).toBe('registered')
    expect(log).toEqual(['channels', 'token:proj-1', 'register:ExponentPushToken[abc]:ios:Test iPhone'])
    expect(store.data[STORAGE_KEYS.registeredToken]).toEqual({ token: 'ExponentPushToken[abc]', userId: 'user-1' })
  })

  it('does nothing without permission, on simulators, or without a projectId', async () => {
    const a = deps({ isGranted: () => Promise.resolve(false) })
    expect(await registerForPush(a.d, 'u')).toBe('no_permission')
    const b = deps({ isDevice: false })
    expect(await registerForPush(b.d, 'u')).toBe('not_device')
    const c = deps({ projectId: null })
    expect(await registerForPush(c.d, 'u')).toBe('no_project_id')
    for (const x of [a, b, c]) expect(x.log.filter((l) => l.startsWith('register'))).toEqual([])
  })

  it('reports errors instead of throwing', async () => {
    const { d } = deps({ registerToken: () => Promise.reject(new Error('rpc')) })
    expect(await registerForPush(d, 'u')).toBe('error')
  })
})

describe('signOutWithPushCleanup', () => {
  it('deletes this device token row BEFORE signing out', async () => {
    const { d, log, store } = deps()
    await store.set(STORAGE_KEYS.registeredToken, { token: 'ExponentPushToken[stored]', userId: 'u' })
    expect(await signOutWithPushCleanup(d)).toEqual({ tokenRemoved: true })
    expect(log).toEqual(['delete:ExponentPushToken[stored]', 'signOut'])
    expect(store.data[STORAGE_KEYS.registeredToken]).toBeUndefined()
  })

  it('falls back to asking Expo for the token when none is stored', async () => {
    const { d, log } = deps()
    await signOutWithPushCleanup(d)
    expect(log).toEqual(['token:proj-1', 'delete:ExponentPushToken[abc]', 'signOut'])
  })

  it('still signs out if the delete fails', async () => {
    const { d, log, store } = deps({ deleteToken: () => Promise.reject(new Error('offline')) })
    await store.set(STORAGE_KEYS.registeredToken, { token: 't', userId: 'u' })
    expect(await signOutWithPushCleanup(d)).toEqual({ tokenRemoved: false })
    expect(log).toEqual(['signOut'])
  })

  it('does not hang on a stuck delete', async () => {
    jest.useFakeTimers()
    try {
      const { d, log, store } = deps({ deleteToken: () => new Promise<void>(() => {}) })
      await store.set(STORAGE_KEYS.registeredToken, { token: 't', userId: 'u' })
      const p = signOutWithPushCleanup(d)
      await jest.advanceTimersByTimeAsync(5001)
      expect(await p).toEqual({ tokenRemoved: false })
      expect(log.filter((l) => l !== 'channels')).toEqual(['signOut'])
    } finally {
      jest.useRealTimers()
    }
  })

  it('no permission and nothing stored: just signs out', async () => {
    const { d, log } = deps({ isGranted: () => Promise.resolve(false) })
    expect(await signOutWithPushCleanup(d)).toEqual({ tokenRemoved: true })
    expect(log).toEqual(['signOut'])
  })
})

describe('ensureFreshSession', () => {
  const NOW = 1_800_000_000_000
  const auth = (expiresAtSec: number | null, refreshOk = true) => ({
    getSession: jest.fn(() =>
      Promise.resolve({ data: { session: expiresAtSec === null ? null : { expires_at: expiresAtSec } }, error: null })
    ),
    refreshSession: jest.fn(() =>
      Promise.resolve(
        refreshOk ? { data: { session: { expires_at: NOW / 1000 + 3600 } }, error: null } : { data: { session: null }, error: new Error('x') }
      )
    ),
  })

  it('leaves a fresh token alone', async () => {
    const a = auth(NOW / 1000 + 600)
    expect(await ensureFreshSession(a, () => NOW)).toBe('ok')
    expect(a.refreshSession).not.toHaveBeenCalled()
  })

  it('refreshes a stale or nearly-expired token before the call', async () => {
    for (const exp of [NOW / 1000 - 3600, NOW / 1000 + 30]) {
      const a = auth(exp)
      expect(await ensureFreshSession(a, () => NOW)).toBe('ok')
      expect(a.refreshSession).toHaveBeenCalledTimes(1)
    }
  })

  it('reports signed-out and failed refreshes', async () => {
    expect(await ensureFreshSession(auth(null), () => NOW)).toBe('signed_out')
    expect(await ensureFreshSession(auth(0, false), () => NOW)).toBe('refresh_failed')
  })
})
