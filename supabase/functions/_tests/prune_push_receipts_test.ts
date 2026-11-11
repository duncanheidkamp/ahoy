import { deepStrictEqual as assertEquals, ok as assert, rejects } from 'node:assert/strict'

import { EXPO_RECEIPT_BATCH, fetchExpoReceipts } from '../_shared/push.ts'
import { handlePruneReceipts, type PruneDeps, type StoredTicket } from '../prune-push-receipts/handler.ts'

const SECRET = 'cron-s3cret'

/** Replaces fetch; `handler` gets the parsed getReceipts body. */
function mockFetch(handler: (ids: string[], url: string) => Response) {
  const calls: { url: string; ids: string[]; headers: Headers }[] = []
  const original = globalThis.fetch
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const ids = (JSON.parse(String(init?.body)) as { ids: string[] }).ids
    calls.push({ url: String(url), ids, headers: new Headers(init?.headers) })
    return Promise.resolve(handler(ids, String(url)))
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

function deps(tickets: StoredTicket[], overrides: Partial<PruneDeps> = {}) {
  const log = { limit: [] as number[], deletedTokens: [] as string[][], deletedTickets: [] as string[][], logs: [] as string[] }
  const d: PruneDeps = {
    secret: SECRET,
    dueTickets: (limit) => {
      log.limit.push(limit)
      return Promise.resolve(tickets)
    },
    getReceipts: fetchExpoReceipts, // real implementation, fetch is mocked
    deleteTokens: (t) => {
      log.deletedTokens.push(t)
      return Promise.resolve()
    },
    deleteTickets: (ids) => {
      log.deletedTickets.push(ids)
      return Promise.resolve()
    },
    log: (m) => {
      log.logs.push(m)
    },
    ...overrides,
  }
  return { d, log }
}

const cron = (secret: string | null = SECRET) =>
  new Request('http://x/prune-push-receipts', {
    method: 'POST',
    headers: secret === null ? {} : { 'x-cron-secret': secret },
    body: '{}',
  })

Deno.test('refuses callers without the cron secret, before touching the database', async () => {
  const { d, log } = deps([{ ticket_id: 'a', token: 't' }])
  assertEquals((await handlePruneReceipts(cron(null), d)).status, 401)
  assertEquals((await handlePruneReceipts(cron('wrong'), d)).status, 401)
  assertEquals((await handlePruneReceipts(cron(SECRET + 'x'), d)).status, 401)
  assertEquals((await handlePruneReceipts(new Request('http://x'), d)).status, 405)
  const unset = deps([], { secret: null })
  assertEquals((await handlePruneReceipts(cron(SECRET), unset.d)).status, 503)
  assertEquals(log.limit.length, 0)
})

Deno.test('deletes DeviceNotRegistered tokens and forgets tickets that have receipts', async () => {
  const f = mockFetch(() =>
    Response.json({
      data: {
        ok1: { status: 'ok' },
        dead1: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        dead2: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        big: { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
        // "pending" has no receipt yet
      },
    })
  )
  try {
    const { d, log } = deps([
      { ticket_id: 'ok1', token: 'ExponentPushToken[live]' },
      { ticket_id: 'dead1', token: 'ExponentPushToken[gone]' },
      { ticket_id: 'dead2', token: 'ExponentPushToken[gone]' },
      { ticket_id: 'big', token: 'ExponentPushToken[live]' },
      { ticket_id: 'pending', token: 'ExponentPushToken[new]' },
    ])
    const res = await handlePruneReceipts(cron(), d)
    assertEquals(res.status, 200)
    assertEquals(await res.json(), { ok: true, checked: 5, receipts: 4, pruned: 1, pending: 1, failed_batches: 0 })
    assertEquals(f.calls.length, 1)
    assertEquals(f.calls[0].url, 'https://exp.host/--/api/v2/push/getReceipts')
    assertEquals(f.calls[0].ids, ['ok1', 'dead1', 'dead2', 'big', 'pending'])
    assertEquals(log.deletedTokens, [['ExponentPushToken[gone]']])
    assertEquals(log.deletedTickets, [['ok1', 'dead1', 'dead2', 'big']])
    assert(log.logs.includes('expo receipt errors'), 'other receipt errors are logged')
  } finally {
    f.restore()
  }
})

Deno.test('fetches receipts in batches of at most 1000 and keeps a failed batch for the next run', async () => {
  let n = 0
  const f = mockFetch((ids) => {
    n++
    if (n === 2) return new Response('busy', { status: 503 })
    return Response.json({ data: Object.fromEntries(ids.map((id) => [id, { status: 'ok' }])) })
  })
  try {
    const tickets = Array.from({ length: 2500 }, (_, i) => ({ ticket_id: `id${i}`, token: `t${i}` }))
    const { d, log } = deps(tickets)
    const body = await (await handlePruneReceipts(cron(), d)).json()
    assertEquals(f.calls.map((c) => c.ids.length), [1000, 1000, 500])
    assert(f.calls.every((c) => c.ids.length <= EXPO_RECEIPT_BATCH))
    assertEquals(body.receipts, 1500)
    assertEquals(body.pending, 1000)
    assertEquals(body.failed_batches, 1)
    assertEquals(log.deletedTokens, [])
    assertEquals(log.deletedTickets[0].length, 1500)
    assert(!log.deletedTickets[0].includes('id1000'), 'tickets of the failed batch are kept')
    assertEquals(log.limit, [5000])
  } finally {
    f.restore()
  }
})

Deno.test('nothing due: no Expo request, no deletes', async () => {
  const f = mockFetch(() => Response.json({ data: {} }))
  try {
    const { d, log } = deps([])
    const body = await (await handlePruneReceipts(cron(), d)).json()
    assertEquals(body.checked, 0)
    assertEquals(f.calls.length, 0)
    assertEquals(log.deletedTickets, [])
  } finally {
    f.restore()
  }
})

Deno.test('fetchExpoReceipts sends the access token when set and rejects oversized or failed requests', async () => {
  const f = mockFetch(() => Response.json({ errors: [{ code: 'X' }] }, { status: 400 }))
  Deno.env.set('EXPO_ACCESS_TOKEN', 'expo-tok')
  try {
    await rejects(fetchExpoReceipts(['a']), /expo receipts http 400/)
    assertEquals(f.calls[0].headers.get('authorization'), 'Bearer expo-tok')
    await rejects(fetchExpoReceipts(Array.from({ length: 1001 }, (_, i) => `${i}`)), /at most 1000/)
    assertEquals(await fetchExpoReceipts([]), {})
    assertEquals(f.calls.length, 1)
  } finally {
    Deno.env.delete('EXPO_ACCESS_TOKEN')
    f.restore()
  }
})
