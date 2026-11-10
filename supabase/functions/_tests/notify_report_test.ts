import { deepStrictEqual as assertEquals, ok } from 'node:assert/strict'

import { handleNotifyReport, resendSender, type ClaimedReport, type NotifyReportDeps, type ReportEmail } from '../notify-report/handler.ts'

const CALLER = '22222222-2222-4222-8222-222222222222'
const REPORT = '55555555-5555-4555-8555-555555555555'

const CLAIMED: ClaimedReport = {
  report_id: REPORT,
  reporter_username: 'erin',
  reported_id: '33333333-3333-4333-8333-333333333333',
  reported_username: 'carol',
  note: 'spamming',
  created_at: '2026-11-12T12:00:00Z',
}

function deps(claim: ClaimedReport | null | Error, overrides: Partial<NotifyReportDeps> = {}) {
  const log = { claims: [] as string[][], emails: [] as ReportEmail[], logs: [] as string[] }
  const d: NotifyReportDeps = {
    authenticate: () => Promise.resolve({ id: CALLER }),
    claim: (caller, id) => {
      log.claims.push([caller, id])
      return claim instanceof Error ? Promise.reject(claim) : Promise.resolve(claim)
    },
    sendEmail: (e) => {
      log.emails.push(e)
      return Promise.resolve()
    },
    log: (m) => log.logs.push(m),
    ...overrides,
  }
  return { d, log }
}

const post = (body: unknown) => new Request('http://x/notify-report', { method: 'POST', body: JSON.stringify(body) })

Deno.test('notify-report: rejects unauthenticated callers and bad ids before touching the database', async () => {
  const unauth = deps(CLAIMED, { authenticate: () => Promise.resolve(null) })
  assertEquals((await handleNotifyReport(post({ report_id: REPORT }), unauth.d)).status, 401)
  const { d, log } = deps(CLAIMED)
  assertEquals((await handleNotifyReport(post({ report_id: 'x' }), d)).status, 400)
  assertEquals((await handleNotifyReport(new Request('http://x', { method: 'POST', body: '{' }), d)).status, 400)
  assertEquals((await handleNotifyReport(new Request('http://x'), d)).status, 405)
  assertEquals(unauth.log.claims.length + log.claims.length, 0)
})

Deno.test('notify-report: claims as the verified caller and emails once', async () => {
  const { d, log } = deps(CLAIMED)
  const res = await handleNotifyReport(post({ report_id: REPORT, reporter_id: 'spoofed' }), d)
  assertEquals(res.status, 200)
  assertEquals((await res.json()).notified, true)
  assertEquals(log.claims, [[CALLER, REPORT]])
  assertEquals(log.emails.length, 1)
  assertEquals(log.emails[0].subject, 'Ahoy report: @carol reported by @erin')
  ok(log.emails[0].text.includes('spamming'))
  ok(log.emails[0].text.includes(CALLER))
})

Deno.test('notify-report: nothing to claim is a no-op', async () => {
  const { d, log } = deps(null)
  const res = await handleNotifyReport(post({ report_id: REPORT }), d)
  assertEquals(res.status, 200)
  assertEquals((await res.json()).notified, false)
  assertEquals(log.emails.length, 0)
})

Deno.test('notify-report: without Resend secrets it only logs', async () => {
  const { d, log } = deps(CLAIMED, { sendEmail: null })
  const res = await handleNotifyReport(post({ report_id: REPORT }), d)
  assertEquals(await res.json(), { ok: true, notified: false, logged: true })
  ok(log.logs[0].includes('@carol'))
})

Deno.test('notify-report: email failure still 200 and logged; db failure 500', async () => {
  const failing = deps(CLAIMED, { sendEmail: () => Promise.reject(new Error('resend down')) })
  const res = await handleNotifyReport(post({ report_id: REPORT }), failing.d)
  assertEquals(res.status, 200)
  ok(failing.log.logs[0].includes('email failed'))
  const broken = deps(new Error('db'))
  assertEquals((await handleNotifyReport(post({ report_id: REPORT }), broken.d)).status, 500)
})

Deno.test('resendSender: needs all three secrets, posts to Resend with mocked fetch', async () => {
  const env = (vals: Record<string, string>) => (k: string) => vals[k]
  assertEquals(resendSender(env({ RESEND_API_KEY: 'k', REPORT_EMAIL_TO: 'a@example.test' })), null)
  assertEquals(resendSender(env({ RESEND_API_KEY: 'k', REPORT_EMAIL_FROM: 'f@example.test' })), null)
  assertEquals(resendSender(env({ REPORT_EMAIL_TO: 'a@example.test', REPORT_EMAIL_FROM: 'f@example.test' })), null)

  const calls: { url: string; init: RequestInit }[] = []
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(new Response('{"id":"x"}', { status: 200 }))
  }) as unknown as typeof fetch
  const send = resendSender(
    env({ RESEND_API_KEY: 're_test', REPORT_EMAIL_TO: 'a@example.test, b@example.test', REPORT_EMAIL_FROM: 'Ahoy <f@example.test>' }),
    fakeFetch
  )
  ok(send)
  await send({ subject: 's', text: 't' })
  assertEquals(calls[0].url, 'https://api.resend.com/emails')
  assertEquals((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer re_test')
  assertEquals(JSON.parse(calls[0].init.body as string), {
    from: 'Ahoy <f@example.test>',
    to: ['a@example.test', 'b@example.test'],
    subject: 's',
    text: 't',
  })

  const rejecting = resendSender(
    env({ RESEND_API_KEY: 'k', REPORT_EMAIL_TO: 'a@example.test', REPORT_EMAIL_FROM: 'f@example.test' }),
    (() => Promise.resolve(new Response('bad', { status: 422 }))) as unknown as typeof fetch
  )
  let threw = false
  try {
    await rejecting!({ subject: 's', text: 't' })
  } catch {
    threw = true
  }
  ok(threw, 'non-2xx from Resend should throw')
})
