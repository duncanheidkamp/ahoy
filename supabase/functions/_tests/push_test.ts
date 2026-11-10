// deno test --config supabase/functions/_tests/deno.json --allow-env supabase/functions/_tests
import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict'

const assertFalse = (v: unknown, msg?: string) => assert(!v, msg)

import { ahoyMessage, friendshipMessage, sendExpoMessages, sendExpoPushes } from '../_shared/push.ts'

const SENDER = '11111111-1111-4111-8111-111111111111'

Deno.test('ahoy payload: phrase title, @username body, sound/category/channel, typed data', () => {
  const m = ahoyMessage('ExponentPushToken[a]', { phrase: 'Arrrggggg Matey!', senderId: SENDER, senderUsername: 'alice' })
  assertEquals(m, {
    to: 'ExponentPushToken[a]',
    title: 'Arrrggggg Matey!',
    body: '@alice',
    sound: 'ahoy.wav',
    priority: 'high',
    channelId: 'ahoy-v1',
    categoryId: 'ahoy',
    threadId: `ahoy-${SENDER}`,
    data: { type: 'ahoy', senderId: SENDER, senderUsername: 'alice' },
  })
})

Deno.test('ahoy payload never collapses/replaces and never sets a badge', () => {
  const m = ahoyMessage('t', { phrase: 'Ahoy!', senderId: SENDER, senderUsername: 'alice' }) as unknown as Record<
    string,
    unknown
  >
  for (const key of ['collapseId', 'tag', 'badge']) assertFalse(key in m, `${key} must not be set`)
  const other = ahoyMessage('t', { phrase: 'Ahoy!', senderId: 'other', senderUsername: 'bob' })
  assert(m.threadId !== other.threadId, 'thread per sender')
})

Deno.test('friend request / accepted payloads', () => {
  const base = { friendshipId: 'f1', actorId: SENDER, actorUsername: 'erin' }
  const req = friendshipMessage('t', { kind: 'request', ...base })
  assertEquals(req.body, '@erin wants to join your crew')
  assertEquals(req.channelId, 'requests-v1')
  assertEquals(req.sound, 'default')
  assertEquals(req.categoryId, undefined)
  assertEquals(req.data, { type: 'friend_request', friendshipId: 'f1', actorId: SENDER, actorUsername: 'erin' })
  const acc = friendshipMessage('t', { kind: 'accepted', ...base })
  assertEquals(acc.body, '@erin joined your crew')
  assertEquals(acc.data.type, 'friend_accepted')
})

function mockFetch(handler: (body: unknown[]) => Response) {
  const calls: unknown[][] = []
  const original = globalThis.fetch
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as unknown[]
    calls.push(body)
    return Promise.resolve(handler(body))
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

Deno.test('sendExpoMessages maps tickets back to tokens and finds dead ones', async () => {
  const f = mockFetch((body) =>
    Response.json({
      data: body.map((_m, i) =>
        i === 1
          ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
          : i === 2
          ? { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } }
          : { status: 'ok', id: `ticket-${i}` }
      ),
    })
  )
  try {
    const r = await sendExpoPushes(['t0', 't1', 't2'], { phrase: 'Ahoy!', senderId: SENDER, senderUsername: 'a' })
    assertEquals(r.sent, 1)
    assertEquals(r.deadTokens, ['t1'])
    assertEquals(r.errors.length, 1)
    assertEquals(f.calls.length, 1)
    assertEquals((f.calls[0][0] as { data: { type: string } }).data.type, 'ahoy')
  } finally {
    f.restore()
  }
})

Deno.test('sendExpoMessages batches by 100 and survives an http error', async () => {
  let n = 0
  const f = mockFetch((body) => {
    n++
    if (n === 2) return new Response('nope', { status: 500 })
    return Response.json({ data: body.map(() => ({ status: 'ok' })) })
  })
  try {
    const msgs = Array.from({ length: 150 }, (_, i) =>
      friendshipMessage(`t${i}`, { kind: 'request', friendshipId: 'f', actorId: 'a', actorUsername: 'a' })
    )
    const r = await sendExpoMessages(msgs)
    assertEquals(f.calls.map((c) => c.length), [100, 50])
    assertEquals(r.sent, 100)
    assertEquals(r.errors.length, 1)
  } finally {
    f.restore()
  }
})

Deno.test('sendExpoMessages with no messages makes no request', async () => {
  const f = mockFetch(() => Response.json({}))
  try {
    assertEquals((await sendExpoMessages([])).sent, 0)
    assertEquals(f.calls.length, 0)
  } finally {
    f.restore()
  }
})
