/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs synchronous require() */
// Exercises the real module-scope wiring in lib/push/bootstrap.ts with
// expo-notifications, expo-task-manager, SecureStore and the network mocked.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

type Fn = (...args: never[]) => unknown

const SENDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const mockState: {
  lastResponse: unknown
  responseListeners: Fn[]
  tasks: Record<string, Fn>
  calls: string[]
  secure: Map<string, string>
  sessionExpiresAt: number
} = { lastResponse: null, responseListeners: [], tasks: {}, calls: [], secure: new Map(), sessionExpiresAt: 0 }

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve(null)),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  addNotificationResponseReceivedListener: jest.fn((l: Fn) => {
    mockState.responseListeners.push(l)
    return { remove: () => {} }
  }),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(mockState.lastResponse)),
  clearLastNotificationResponseAsync: jest.fn(() => {
    mockState.calls.push('clearLast')
    return Promise.resolve()
  }),
  dismissNotificationAsync: jest.fn((id: string) => {
    mockState.calls.push(`dismiss:${id}`)
    return Promise.resolve()
  }),
  registerTaskAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, status: 'granted', canAskAgain: true })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ type: 'expo', data: 'ExponentPushToken[x]' })),
}))

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((name: string, fn: Fn) => {
    mockState.tasks[name] = fn
  }),
}))

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: (k: string) => Promise.resolve(mockState.secure.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockState.secure.set(k, v)
    return Promise.resolve()
  },
  deleteItemAsync: (k: string) => {
    mockState.secure.delete(k)
    return Promise.resolve()
  },
}))

jest.mock('expo-device', () => ({ isDevice: true, deviceName: 'Test', modelName: 'Test' }))
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'p' } } } } }))

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { expires_at: mockState.sessionExpiresAt } }, error: null }),
      refreshSession: () => {
        mockState.calls.push('refresh')
        return Promise.resolve({ data: { session: { expires_at: Date.now() / 1000 + 3600 } }, error: null })
      },
    },
  },
}))

jest.mock('@/lib/queries', () => {
  class SendAhoyError extends Error {
    failure: string
    constructor(failure: string) {
      super(failure)
      this.failure = failure
    }
  }
  return {
    SendAhoyError,
    sendAhoy: jest.fn((id: string) => {
      mockState.calls.push(`send:${id}`)
      return Promise.resolve({ phrase: 'Ahoy!' })
    }),
  }
})

const response = (id: string, action: string, data: Record<string, unknown>) => ({
  actionIdentifier: action,
  notification: { date: 0, request: { identifier: id, content: { title: 'Ahoy!', body: '@alice', data }, trigger: null } },
})
const ahoyData = { type: 'ahoy', senderId: SENDER, senderUsername: 'alice' }

const flush = () => new Promise((r) => setTimeout(r, 0))
async function settle() {
  for (let i = 0; i < 10; i++) await flush()
}

function boot(os: 'ios' | 'android' = 'ios') {
  let mods!: {
    Notifications: Record<string, jest.Mock>
    events: typeof import('@/lib/push/events')
  }
  jest.isolateModules(() => {
    const { Platform } = require('react-native')
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true })
    require('@/lib/push/bootstrap')
    mods = { Notifications: require('expo-notifications'), events: require('@/lib/push/events') }
  })
  return mods
}

beforeEach(() => {
  mockState.lastResponse = null
  mockState.responseListeners = []
  mockState.tasks = {}
  mockState.calls = []
  mockState.secure = new Map()
  mockState.sessionExpiresAt = Date.now() / 1000 + 3600
  jest.clearAllMocks()
})

describe('push bootstrap', () => {
  it('registers the ahoy category with a background "Ahoy back!" action', () => {
    const { Notifications } = boot()
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('ahoy', [
      { identifier: 'AHOY_BACK', buttonTitle: 'Ahoy back!', options: { opensAppToForeground: false } },
    ])
  })

  it('foreground handler suppresses system UI for an ahoy', async () => {
    const { Notifications } = boot()
    const handler = (Notifications.setNotificationHandler.mock.calls[0][0] as {
      handleNotification: (n: unknown) => Promise<unknown>
    }).handleNotification
    await expect(handler(response('n', 'x', ahoyData).notification)).resolves.toMatchObject({
      shouldShowBanner: false,
      shouldPlaySound: false,
    })
  })

  it('cold start via "Ahoy back!": sends once even when the listener also delivers it', async () => {
    mockState.lastResponse = response('n1', 'AHOY_BACK', ahoyData)
    boot()
    // iOS/Android may also hand the launching response to the listener.
    mockState.responseListeners.forEach((l) => l(mockState.lastResponse as never))
    await settle()
    expect(mockState.calls.filter((c) => c.startsWith('send:'))).toEqual([`send:${SENDER}`])
    expect(mockState.calls).toContain('dismiss:n1')
    expect(mockState.calls).toContain('clearLast')
  })

  it('refreshes a stale access token before sending from a notification', async () => {
    mockState.sessionExpiresAt = Date.now() / 1000 - 600
    boot()
    mockState.responseListeners[0](response('n1', 'AHOY_BACK', ahoyData) as never)
    await settle()
    expect(mockState.calls.filter((c) => c === 'refresh' || c.startsWith('send:'))).toEqual(['refresh', `send:${SENDER}`])
  })

  it('cold start via a tap on a friend request queues the Requests route', async () => {
    mockState.lastResponse = response('n2', 'expo.modules.notifications.actions.DEFAULT', {
      type: 'friend_request',
      friendshipId: 'f',
      actorId: 'a',
      actorUsername: 'erin',
    })
    const { events } = boot()
    await settle()
    expect(events.pushRoutes.take()).toBe('/requests')
  })

  it('iOS does not register the background task (responses never reach it there)', () => {
    const { Notifications } = boot('ios')
    expect(Notifications.registerTaskAsync).not.toHaveBeenCalled()
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled()
  })

  it('Android: creates both channels and handles "Ahoy back!" in the headless task', async () => {
    const { Notifications } = boot('android')
    await settle()
    expect(Notifications.registerTaskAsync).toHaveBeenCalledWith('ahoy-background-notification')
    const channels = Notifications.setNotificationChannelAsync.mock.calls.map((c) => [c[0], (c[1] as { sound: string }).sound])
    expect(channels).toEqual([
      ['ahoy-v1', 'ahoy.wav'],
      ['requests-v1', 'default'],
    ])
    const raw = {
      actionIdentifier: 'AHOY_BACK',
      notification: { request: { identifier: 'a1', content: { dataString: JSON.stringify(ahoyData) } } },
    }
    await mockState.tasks['ahoy-background-notification']({ data: raw, error: null } as never)
    // ...and the same response showing up later in the app is not re-sent.
    mockState.responseListeners[0](raw as never)
    await settle()
    expect(mockState.calls.filter((c) => c.startsWith('send:'))).toEqual([`send:${SENDER}`])
  })
})
