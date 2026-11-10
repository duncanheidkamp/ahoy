import { createHash, randomBytes } from 'crypto'

import { describe, expect, it, jest } from '@jest/globals'

import {
  availableProviders,
  createNonce,
  signInWithApple,
  signInWithGoogle,
  toHex,
  type IdTokenSignIn,
} from '@/lib/social-auth'

const nodeNonceDeps = {
  randomBytes: (n: number) => new Uint8Array(randomBytes(n)),
  sha256Hex: (s: string) => Promise.resolve(createHash('sha256').update(s, 'utf8').digest('hex')),
}

describe('Apple nonce', () => {
  it('hex-encodes bytes', () => {
    expect(toHex(new Uint8Array([0, 15, 255, 16]))).toBe('000fff10')
  })

  it('raw nonce is 32 random bytes as hex; hashed is its SHA-256 hex', async () => {
    const { raw, hashed } = await createNonce(nodeNonceDeps)
    expect(raw).toMatch(/^[0-9a-f]{64}$/)
    expect(hashed).toBe(createHash('sha256').update(raw).digest('hex'))
    expect(hashed).not.toBe(raw)
  })

  it('is different every time', async () => {
    const a = await createNonce(nodeNonceDeps)
    const b = await createNonce(nodeNonceDeps)
    expect(a.raw).not.toBe(b.raw)
  })

  it('known vector: sha256("abc")', async () => {
    const deps = { randomBytes: () => new Uint8Array(), sha256Hex: nodeNonceDeps.sha256Hex }
    expect(await deps.sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('signInWithApple', () => {
  function setup(appleResult: Promise<{ identityToken: string | null }>, supabaseError: { message: string } | null = null) {
    const appleSignIn = jest.fn((_hashed: string) => appleResult)
    const signInWithIdToken = jest.fn<IdTokenSignIn>(() => Promise.resolve({ error: supabaseError }))
    return { appleSignIn, signInWithIdToken, deps: { ...nodeNonceDeps, appleSignIn, signInWithIdToken } }
  }

  it('sends the HASHED nonce to Apple and the RAW nonce to Supabase', async () => {
    const { deps, appleSignIn, signInWithIdToken } = setup(Promise.resolve({ identityToken: 'apple.jwt' }))
    expect(await signInWithApple(deps)).toEqual({ status: 'signed_in' })
    const hashed = appleSignIn.mock.calls[0][0]
    const args = signInWithIdToken.mock.calls[0][0]
    expect(args.provider).toBe('apple')
    expect(args.token).toBe('apple.jwt')
    expect(createHash('sha256').update(args.nonce!).digest('hex')).toBe(hashed)
  })

  it('cancel is not an error', async () => {
    const { deps, signInWithIdToken } = setup(Promise.reject(Object.assign(new Error('x'), { code: 'ERR_REQUEST_CANCELED' })))
    expect(await signInWithApple(deps)).toEqual({ status: 'cancelled' })
    expect(signInWithIdToken).not.toHaveBeenCalled()
  })

  it('missing token or Supabase error -> error', async () => {
    expect((await signInWithApple(setup(Promise.resolve({ identityToken: null })).deps)).status).toBe('error')
    expect((await signInWithApple(setup(Promise.resolve({ identityToken: 't' }), { message: 'bad nonce' }).deps)).status).toBe(
      'error'
    )
    expect((await signInWithApple(setup(Promise.reject(new Error('boom'))).deps)).status).toBe('error')
  })
})

describe('signInWithGoogle', () => {
  const ok = () => jest.fn<IdTokenSignIn>(() => Promise.resolve({ error: null }))

  it('passes the idToken to Supabase without a nonce', async () => {
    const signInWithIdToken = ok()
    const result = await signInWithGoogle({
      ensurePlayServices: () => Promise.resolve(),
      googleSignIn: () => Promise.resolve({ type: 'success', idToken: 'google.jwt' }),
      signInWithIdToken,
    })
    expect(result).toEqual({ status: 'signed_in' })
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'google.jwt' })
  })

  it('cancel (response or error code) is not an error', async () => {
    const base = { ensurePlayServices: () => Promise.resolve(), signInWithIdToken: ok() }
    expect(await signInWithGoogle({ ...base, googleSignIn: () => Promise.resolve({ type: 'cancelled' }) })).toEqual({
      status: 'cancelled',
    })
    expect(
      await signInWithGoogle({ ...base, googleSignIn: () => Promise.reject(Object.assign(new Error(), { code: 'SIGN_IN_CANCELLED' })) })
    ).toEqual({ status: 'cancelled' })
  })

  it('no Play Services / no token -> error', async () => {
    const r = await signInWithGoogle({
      ensurePlayServices: () => Promise.reject(Object.assign(new Error(), { code: 'PLAY_SERVICES_NOT_AVAILABLE' })),
      googleSignIn: () => Promise.resolve({ type: 'success', idToken: 't' }),
      signInWithIdToken: ok(),
    })
    expect(r.status).toBe('error')
    const r2 = await signInWithGoogle({
      ensurePlayServices: () => Promise.resolve(),
      googleSignIn: () => Promise.resolve({ type: 'success', idToken: null }),
      signInWithIdToken: ok(),
    })
    expect(r2.status).toBe('error')
  })
})

describe('availableProviders', () => {
  const ids = { web: 'w', ios: 'i', android: 'a' }

  it('iOS: Apple + Google when configured', () => {
    expect(availableProviders({ platform: 'ios', appleAvailable: true, googleClientIds: ids })).toEqual(['apple', 'google'])
  })

  it('iOS: never Google without Apple (guideline 4.8)', () => {
    expect(availableProviders({ platform: 'ios', appleAvailable: false, googleClientIds: ids })).toEqual([])
  })

  it('Android: Google only, Apple hidden', () => {
    expect(availableProviders({ platform: 'android', appleAvailable: true, googleClientIds: ids })).toEqual(['google'])
  })

  it('Google needs the web id and the platform id', () => {
    expect(availableProviders({ platform: 'ios', appleAvailable: true, googleClientIds: { ...ids, web: '' } })).toEqual([
      'apple',
    ])
    expect(availableProviders({ platform: 'ios', appleAvailable: true, googleClientIds: { ...ids, ios: '' } })).toEqual([
      'apple',
    ])
    expect(availableProviders({ platform: 'android', appleAvailable: false, googleClientIds: { ...ids, android: '' } })).toEqual(
      []
    )
  })
})
