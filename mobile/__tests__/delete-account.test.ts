import { describe, expect, it, jest } from '@jest/globals'

import { canConfirmDelete, deleteAccount, type DeleteAccountDeps } from '@/lib/delete-account'
import { memoryStore } from '@/lib/kv'
import { clearLocalState, localStateKeys } from '@/lib/local-state'

describe('canConfirmDelete', () => {
  it('requires the exact username (case, @ and spaces forgiven)', () => {
    expect(canConfirmDelete('captain_d', 'captain_d')).toBe(true)
    expect(canConfirmDelete(' @Captain_D ', 'captain_d')).toBe(true)
  })
  it.each(['', 'captain', 'captain_d2', 'delete'])('rejects %p', (typed) => {
    expect(canConfirmDelete(typed, 'captain_d')).toBe(false)
  })
  it('never confirms without a username', () => {
    expect(canConfirmDelete('', null)).toBe(false)
    expect(canConfirmDelete('x', undefined)).toBe(false)
  })
})

function setup(overrides: Partial<DeleteAccountDeps> = {}) {
  const order: string[] = []
  const deps: DeleteAccountDeps = {
    getAppleAuthorizationCode: jest.fn(async () => {
      order.push('apple')
      return null
    }),
    invokeDelete: jest.fn(async () => {
      order.push('delete')
      return { error: null }
    }),
    clearLocalState: jest.fn(async () => {
      order.push('clear')
    }),
    signOutLocal: jest.fn(async () => {
      order.push('signout')
    }),
    ...overrides,
  }
  return { deps, order }
}

describe('deleteAccount', () => {
  it('deletes on the server, then clears the device, then signs out', async () => {
    const { deps, order } = setup()
    expect(await deleteAccount(deps)).toBe('deleted')
    expect(order).toEqual(['apple', 'delete', 'clear', 'signout'])
    expect(deps.invokeDelete).toHaveBeenCalledWith({})
  })

  it('sends a fresh Apple authorization code when there is one', async () => {
    const { deps } = setup({ getAppleAuthorizationCode: () => Promise.resolve('apple-code') })
    await deleteAccount(deps)
    expect(deps.invokeDelete).toHaveBeenCalledWith({ apple_authorization_code: 'apple-code' })
  })

  it('an Apple failure does not stop deletion', async () => {
    const { deps } = setup({ getAppleAuthorizationCode: () => Promise.reject(new Error('cancelled')) })
    expect(await deleteAccount(deps)).toBe('deleted')
    expect(deps.invokeDelete).toHaveBeenCalledWith({})
  })

  it('server failure keeps the user signed in with their data', async () => {
    const { deps, order } = setup({ invokeDelete: () => Promise.resolve({ error: new Error('offline') }) })
    expect(await deleteAccount(deps)).toBe('failed')
    expect(order).toEqual(['apple'])
    expect(deps.signOutLocal).not.toHaveBeenCalled()
  })

  it('a local cleanup failure still signs out', async () => {
    const { deps } = setup({ clearLocalState: () => Promise.reject(new Error('keychain')) })
    expect(await deleteAccount(deps)).toBe('deleted')
    expect(deps.signOutLocal).toHaveBeenCalled()
  })
})

describe('clearLocalState', () => {
  it('removes push bookkeeping, pending invite and per-user phrase/request state', async () => {
    const keys = localStateKeys('u1')
    const store = memoryStore(Object.fromEntries([...keys, 'ahoy.phrases.seen.other'].map((k) => [k, 1])))
    await clearLocalState('u1', store)
    expect(Object.keys(store.data)).toEqual(['ahoy.phrases.seen.other'])
    expect(keys).toEqual(
      expect.arrayContaining(['ahoy.push.token', 'ahoy.links.pendingInvite', 'ahoy.phrases.seen.u1', 'ahoy.requests.hidden.u1'])
    )
  })
})
