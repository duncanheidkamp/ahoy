import { deepStrictEqual as assertEquals } from 'node:assert/strict'

import type { ExpoMessage } from '../_shared/push.ts'
import { handleNotifyFriendship, type ClaimResult, type NotifyDeps } from '../notify-friendship/handler.ts'

const CALLER = '22222222-2222-4222-8222-222222222222'
const RECIPIENT = '33333333-3333-4333-8333-333333333333'
const FRIENDSHIP = '44444444-4444-4444-8444-444444444444'

function deps(claim: Partial<ClaimResult> | Error, overrides: Partial<NotifyDeps> = {}) {
  const log = { claims: [] as string[][], sent: [] as ExpoMessage[][], deleted: [] as string[][] }
  const d: NotifyDeps = {
    authenticate: () => Promise.resolve({ id: CALLER }),
    claim: (caller, id) => {
      log.claims.push([caller, id])
      if (claim instanceof Error) return Promise.reject(claim)
      return Promise.resolve({ ok: false, reason: null, kind: null, recipient_id: null, actor_username: null, ...claim })
    },
    expoTokensFor: () => Promise.resolve(['ExponentPushToken[r1]', 'ExponentPushToken[r2]']),
    sendExpo: (messages) => {
      log.sent.push(messages)
      return Promise.resolve({ sent: 1, deadTokens: ['ExponentPushToken[r2]'], errors: [] })
    },
    deleteTokens: (t) => {
      log.deleted.push(t)
      return Promise.resolve()
    },
    ...overrides,
  }
  return { d, log }
}

const post = (body: unknown) =>
  new Request('http://x/notify-friendship', { method: 'POST', body: JSON.stringify(body) })

Deno.test('rejects unauthenticated callers before touching the database', async () => {
  const { d, log } = deps({ ok: true }, { authenticate: () => Promise.resolve(null) })
  const res = await handleNotifyFriendship(post({ friendship_id: FRIENDSHIP }), d)
  assertEquals(res.status, 401)
  assertEquals(log.claims.length, 0)
})

Deno.test('validates friendship_id', async () => {
  const { d, log } = deps({ ok: true })
  assertEquals((await handleNotifyFriendship(post({ friendship_id: 'nope' }), d)).status, 400)
  assertEquals((await handleNotifyFriendship(post({}), d)).status, 400)
  const bad = new Request('http://x', { method: 'POST', body: '{' })
  assertEquals((await handleNotifyFriendship(bad, d)).status, 400)
  assertEquals((await handleNotifyFriendship(new Request('http://x'), d)).status, 405)
  assertEquals(log.claims.length, 0)
})

Deno.test('claims as the verified caller (never a client-supplied id) and pushes to the recipient', async () => {
  const { d, log } = deps({ ok: true, kind: 'request', recipient_id: RECIPIENT, actor_username: 'erin' })
  const res = await handleNotifyFriendship(post({ friendship_id: FRIENDSHIP, caller: 'spoofed' }), d)
  assertEquals(res.status, 200)
  assertEquals(log.claims, [[CALLER, FRIENDSHIP]])
  assertEquals(log.sent[0].map((m) => m.to), ['ExponentPushToken[r1]', 'ExponentPushToken[r2]'])
  assertEquals(log.sent[0][0].body, '@erin wants to join your crew')
  assertEquals(log.sent[0][0].data, {
    type: 'friend_request',
    friendshipId: FRIENDSHIP,
    actorId: CALLER,
    actorUsername: 'erin',
  })
  assertEquals(log.deleted, [['ExponentPushToken[r2]']])
  assertEquals((await res.json()).notified, true)
})

Deno.test('accepted claim sends the joined-your-crew push', async () => {
  const { d, log } = deps({ ok: true, kind: 'accepted', recipient_id: RECIPIENT, actor_username: 'alice' })
  await handleNotifyFriendship(post({ friendship_id: FRIENDSHIP }), d)
  assertEquals(log.sent[0][0].body, '@alice joined your crew')
  assertEquals(log.sent[0][0].data.type, 'friend_accepted')
})

Deno.test('refused claims send nothing', async () => {
  for (const [reason, status] of [
    ['not_found', 404],
    ['not_notifiable', 409],
    ['rate_limited', 429],
    ['already_notified', 200],
  ] as const) {
    const { d, log } = deps({ ok: false, reason })
    const res = await handleNotifyFriendship(post({ friendship_id: FRIENDSHIP }), d)
    assertEquals(res.status, status, reason)
    assertEquals(log.sent.length, 0, reason)
  }
})

Deno.test('database errors are a 500 with nothing sent', async () => {
  const { d, log } = deps(new Error('boom'))
  const res = await handleNotifyFriendship(post({ friendship_id: FRIENDSHIP }), d)
  assertEquals(res.status, 500)
  assertEquals(log.sent.length, 0)
})
