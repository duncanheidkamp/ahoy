import { describe, expect, it, jest } from '@jest/globals'

import { memoryStore } from '@/lib/kv'
import { createAhoyBackQueue, type SendOutcome } from '@/lib/push/ahoy-back'
import { AHOY_BACK_ACTION_ID } from '@/lib/push/constants'
import { createDedupe } from '@/lib/push/dedupe'
import { createResponseHandler, DEFAULT_ACTION_ID, type ResponseDeps } from '@/lib/push/responses'

const SENDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function ahoyResponse(requestId: string, action: string, data: Record<string, unknown> = {}) {
  return {
    actionIdentifier: action,
    notification: {
      date: 0,
      request: {
        identifier: requestId,
        content: {
          title: 'Ahoy!',
          body: '@alice',
          data: { type: 'ahoy', senderId: SENDER, senderUsername: 'alice', ...data } as Record<string, unknown>,
        },
        trigger: null,
      },
    },
  }
}

function setup(sendResult: SendOutcome = { ok: true }, store = memoryStore()) {
  const send = jest.fn<(id: string) => Promise<SendOutcome>>(() => Promise.resolve(sendResult))
  const deps = {
    dedupe: createDedupe(store),
    ahoyBack: createAhoyBackQueue({ store, send }),
    dismiss: jest.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
    navigate: jest.fn(),
    notify: jest.fn(),
    isForeground: jest.fn(() => true),
  } satisfies ResponseDeps
  return { handler: createResponseHandler(deps), deps, send, store }
}

describe('notification response handler', () => {
  it('matches expo-notifications DEFAULT_ACTION_IDENTIFIER', () => {
    const actual = jest.requireActual<typeof import('expo-notifications')>('expo-notifications')
    expect(DEFAULT_ACTION_ID).toBe(actual.DEFAULT_ACTION_IDENTIFIER)
  })

  it('AHOY_BACK sends one ahoy to data.senderId, dismisses the notification and toasts in the foreground', async () => {
    const { handler, deps, send } = setup()
    const r = await handler.handle(ahoyResponse('n1', AHOY_BACK_ACTION_ID), 'listener')
    expect(r).toEqual({ kind: 'ahoy_back', result: 'sent' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(SENDER)
    expect(deps.dismiss).toHaveBeenCalledWith('n1')
    expect(deps.notify).toHaveBeenCalledWith('Ahoy sent back to @alice')
    expect(deps.navigate).not.toHaveBeenCalled()
  })

  it('no toast when it ran in the background', async () => {
    const { handler, deps } = setup()
    deps.isForeground.mockReturnValue(false)
    await handler.handle(ahoyResponse('n1', AHOY_BACK_ACTION_ID), 'task')
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('dedupes the same response arriving via listener, last-response and task — even concurrently', async () => {
    const { handler, send } = setup()
    const resp = ahoyResponse('n1', AHOY_BACK_ACTION_ID)
    const results = await Promise.all([
      handler.handle(resp, 'listener'),
      handler.handle(resp, 'last-response'),
      handler.handle(resp, 'task'),
    ])
    expect(send).toHaveBeenCalledTimes(1)
    expect(results.filter((r) => r.kind === 'duplicate')).toHaveLength(2)
  })

  it('dedupe persists across JS runtimes (Android headless task, then the app)', async () => {
    const store = memoryStore()
    const headless = setup({ ok: true }, store)
    await headless.handler.handle(ahoyResponse('n1', AHOY_BACK_ACTION_ID), 'task')
    const app = setup({ ok: true }, store) // fresh in-memory state, same storage
    const r = await app.handler.handle(ahoyResponse('n1', AHOY_BACK_ACTION_ID), 'last-response')
    expect(r).toEqual({ kind: 'duplicate' })
    expect(app.send).not.toHaveBeenCalled()
  })

  it('different notifications from the same sender each send', async () => {
    const { handler, send } = setup()
    await handler.handle(ahoyResponse('n1', AHOY_BACK_ACTION_ID), 'listener')
    await handler.handle(ahoyResponse('n2', AHOY_BACK_ACTION_ID), 'listener')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('handles the raw Android task payload (data as dataString)', async () => {
    const { handler, send } = setup()
    const raw = {
      actionIdentifier: AHOY_BACK_ACTION_ID,
      notification: {
        date: 1,
        request: {
          identifier: '0:1731-abc',
          content: {
            title: 'Ahoy!',
            body: '@alice',
            dataString: JSON.stringify({ type: 'ahoy', senderId: SENDER, senderUsername: 'alice' }),
          },
        },
      },
    }
    expect(await handler.handle(raw, 'task')).toEqual({ kind: 'ahoy_back', result: 'sent' })
    expect(send).toHaveBeenCalledWith(SENDER)
  })

  it('a failed background send is queued, not lost', async () => {
    const { handler, deps } = setup({ ok: false, failure: 'network' })
    const r = await handler.handle(ahoyResponse('n1', AHOY_BACK_ACTION_ID), 'task')
    expect(r).toEqual({ kind: 'ahoy_back', result: 'queued' })
    expect(await deps.ahoyBack.pending()).toHaveLength(1)
  })

  it('default tap on an ahoy opens Crew; on a friend request opens Requests', async () => {
    const { handler, deps, send } = setup()
    expect(await handler.handle(ahoyResponse('n1', DEFAULT_ACTION_ID), 'listener')).toEqual({
      kind: 'navigated',
      route: '/',
    })
    const fr = ahoyResponse('n2', DEFAULT_ACTION_ID)
    fr.notification.request.content.data = { type: 'friend_request', friendshipId: 'f', actorId: 'a', actorUsername: 'x' }
    expect(await handler.handle(fr, 'last-response')).toEqual({ kind: 'navigated', route: '/requests' })
    expect(deps.navigate.mock.calls).toEqual([['/'], ['/requests']])
    expect(send).not.toHaveBeenCalled()
  })

  it('a cold-start tap that also reaches the listener navigates once', async () => {
    const { handler, deps } = setup()
    const resp = ahoyResponse('n1', DEFAULT_ACTION_ID)
    await handler.handle(resp, 'last-response')
    await handler.handle(resp, 'listener')
    expect(deps.navigate).toHaveBeenCalledTimes(1)
  })

  it('AHOY_BACK then a tap on the same notification are different interactions', async () => {
    const { handler, deps, send } = setup()
    await handler.handle(ahoyResponse('n1', AHOY_BACK_ACTION_ID), 'listener')
    await handler.handle(ahoyResponse('n1', DEFAULT_ACTION_ID), 'listener')
    expect(send).toHaveBeenCalledTimes(1)
    expect(deps.navigate).toHaveBeenCalledTimes(1)
  })

  it('ignores junk, unknown actions and AHOY_BACK on non-ahoy pushes', async () => {
    const { handler, send, deps } = setup()
    expect(await handler.handle(null, 'listener')).toEqual({ kind: 'ignored' })
    expect(await handler.handle({ actionIdentifier: 'x' }, 'listener')).toEqual({ kind: 'ignored' })
    expect(await handler.handle(ahoyResponse('n1', 'com.apple.UNNotificationDismissActionIdentifier'), 'listener')).toEqual(
      { kind: 'ignored' }
    )
    const fr = ahoyResponse('n2', AHOY_BACK_ACTION_ID)
    fr.notification.request.content.data = { type: 'friend_request', friendshipId: 'f', actorId: 'a' }
    expect(await handler.handle(fr, 'listener')).toEqual({ kind: 'ignored' })
    expect(send).not.toHaveBeenCalled()
    expect(deps.navigate).not.toHaveBeenCalled()
  })
})
