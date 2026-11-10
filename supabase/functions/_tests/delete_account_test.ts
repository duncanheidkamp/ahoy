import { deepStrictEqual as assertEquals, ok } from 'node:assert/strict'

import { appleClientSecret, appleConfigFromEnv, revokeAppleAuthorizationCode, type AppleConfig } from '../delete-account/apple.ts'
import { handleDeleteAccount, type DeleteDeps } from '../delete-account/handler.ts'

const CALLER = '22222222-2222-4222-8222-222222222222'

function deps(overrides: Partial<DeleteDeps> = {}) {
  const log = { deleted: [] as string[], revoked: [] as string[], order: [] as string[] }
  const d: DeleteDeps = {
    authenticate: () => Promise.resolve({ id: CALLER }),
    deleteUser: (id) => {
      log.deleted.push(id)
      log.order.push('delete')
      return Promise.resolve({ error: null })
    },
    revokeApple: (code) => {
      log.revoked.push(code)
      log.order.push('revoke')
      return Promise.resolve('revoked')
    },
    log: () => {},
    ...overrides,
  }
  return { d, log }
}

const post = (body?: unknown) =>
  new Request('http://x/delete-account', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

Deno.test('delete-account: 401 without a valid JWT, nothing deleted', async () => {
  const { d, log } = deps({ authenticate: () => Promise.resolve(null) })
  assertEquals((await handleDeleteAccount(post(), d)).status, 401)
  assertEquals(log.deleted.length, 0)
})

Deno.test('delete-account: deletes the verified caller (never a body-supplied id), no body needed', async () => {
  const { d, log } = deps()
  const res = await handleDeleteAccount(post(), d)
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { ok: true, apple: 'skipped' })
  assertEquals(log.deleted, [CALLER])
  const again = deps()
  await handleDeleteAccount(post({ user_id: 'someone-else' }), again.d)
  assertEquals(again.log.deleted, [CALLER])
})

Deno.test('delete-account: revokes Apple tokens before deleting when a code is sent', async () => {
  const { d, log } = deps()
  const res = await handleDeleteAccount(post({ apple_authorization_code: 'c0de' }), d)
  assertEquals((await res.json()).apple, 'revoked')
  assertEquals(log.revoked, ['c0de'])
  assertEquals(log.order, ['revoke', 'delete'])
})

Deno.test('delete-account: a failed or unconfigured revocation still deletes', async () => {
  const failing = deps({ revokeApple: () => Promise.reject(new Error('apple down')) })
  const res = await handleDeleteAccount(post({ apple_authorization_code: 'c' }), failing.d)
  assertEquals(res.status, 200)
  assertEquals((await res.json()).apple, 'revoke_failed')
  assertEquals(failing.log.deleted, [CALLER])

  const unconfigured = deps({ revokeApple: null })
  const res2 = await handleDeleteAccount(post({ apple_authorization_code: 'c' }), unconfigured.d)
  assertEquals((await res2.json()).apple, 'not_configured')
  assertEquals(unconfigured.log.deleted, [CALLER])
})

Deno.test('delete-account: auth delete error is a 500', async () => {
  const { d } = deps({ deleteUser: () => Promise.resolve({ error: new Error('x') }) })
  assertEquals((await handleDeleteAccount(post(), d)).status, 500)
})

async function testConfig(): Promise<{ config: AppleConfig; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const b64 = btoa(String.fromCharCode(...der))
  // Literal "\n" like a secret set from a shell.
  const pem = `-----BEGIN PRIVATE KEY-----\\n${b64.match(/.{1,64}/g)!.join('\\n')}\\n-----END PRIVATE KEY-----`
  return {
    config: { teamId: 'TEAM123456', keyId: 'KEY1234567', clientId: 'com.duncanheidkamp.ahoy', privateKeyPem: pem },
    publicKey: pair.publicKey,
  }
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

Deno.test('apple: config needs all four secrets', () => {
  assertEquals(appleConfigFromEnv(() => undefined), null)
  const all: Record<string, string> = { APPLE_TEAM_ID: 't', APPLE_KEY_ID: 'k', APPLE_CLIENT_ID: 'c', APPLE_PRIVATE_KEY: 'p' }
  ok(appleConfigFromEnv((k) => all[k]))
  assertEquals(appleConfigFromEnv((k) => (k === 'APPLE_KEY_ID' ? undefined : all[k])), null)
})

Deno.test('apple: client secret is a valid ES256 JWT for appleid.apple.com', async () => {
  const { config, publicKey } = await testConfig()
  const jwt = await appleClientSecret(config, 1_800_000_000)
  const [h, p, s] = jwt.split('.')
  assertEquals(JSON.parse(new TextDecoder().decode(b64urlDecode(h))), { alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' })
  assertEquals(JSON.parse(new TextDecoder().decode(b64urlDecode(p))), {
    iss: 'TEAM123456',
    iat: 1_800_000_000,
    exp: 1_800_000_300,
    aud: 'https://appleid.apple.com',
    sub: 'com.duncanheidkamp.ahoy',
  })
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    b64urlDecode(s),
    new TextEncoder().encode(`${h}.${p}`)
  )
  ok(valid, 'signature verifies with the public key')
})

Deno.test('apple: exchanges the code then revokes the refresh token (mocked fetch)', async () => {
  const { config } = await testConfig()
  const calls: { url: string; body: URLSearchParams }[] = []
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(init.body as string) })
    if (url.endsWith('/auth/token')) {
      return Promise.resolve(new Response(JSON.stringify({ refresh_token: 'rt', access_token: 'at' }), { status: 200 }))
    }
    return Promise.resolve(new Response('', { status: 200 }))
  }) as unknown as typeof fetch
  assertEquals(await revokeAppleAuthorizationCode(config, 'the-code', fakeFetch), 'revoked')
  assertEquals(calls.map((c) => c.url), ['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke'])
  assertEquals(calls[0].body.get('grant_type'), 'authorization_code')
  assertEquals(calls[0].body.get('code'), 'the-code')
  assertEquals(calls[0].body.get('client_id'), 'com.duncanheidkamp.ahoy')
  ok(calls[0].body.get('client_secret')!.split('.').length === 3)
  assertEquals(calls[1].body.get('token'), 'rt')
  assertEquals(calls[1].body.get('token_type_hint'), 'refresh_token')

  const badExchange = (() => Promise.resolve(new Response('{"error":"invalid_grant"}', { status: 400 }))) as unknown as typeof fetch
  assertEquals(await revokeAppleAuthorizationCode(config, 'x', badExchange), 'exchange_failed')
})
