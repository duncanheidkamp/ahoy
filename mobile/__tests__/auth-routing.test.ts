import { describe, expect, it } from '@jest/globals'

import { authRoute, type AuthRouteInput } from '@/lib/auth-routing'

const profile = (p: Partial<AuthRouteInput['profile']>): AuthRouteInput['profile'] => ({
  data: undefined,
  isPending: false,
  isError: false,
  ...p,
})

describe('authRoute (username-required routing)', () => {
  it('waits for the stored session', () => {
    expect(authRoute({ authLoading: true, hasSession: false, profile: profile({ isPending: true }) })).toBe('loading')
  })

  it('signed out -> auth', () => {
    expect(authRoute({ authLoading: false, hasSession: false, profile: profile({ isPending: true }) })).toBe('auth')
  })

  it('signed in, profile loading -> keep the splash', () => {
    expect(authRoute({ authLoading: false, hasSession: true, profile: profile({ isPending: true }) })).toBe('loading')
  })

  it('social-login account without a username -> pick-username', () => {
    expect(authRoute({ authLoading: false, hasSession: true, profile: profile({ data: { username: null } }) })).toBe(
      'pick-username'
    )
  })

  it('username present -> app', () => {
    expect(authRoute({ authLoading: false, hasSession: true, profile: profile({ data: { username: 'gus' } }) })).toBe('app')
  })

  it('a later refetch error keeps the cached decision', () => {
    expect(
      authRoute({ authLoading: false, hasSession: true, profile: profile({ data: { username: null }, isError: true }) })
    ).toBe('pick-username')
  })

  it('profile failed with nothing cached -> app (shows its own errors, re-routes later)', () => {
    expect(authRoute({ authLoading: false, hasSession: true, profile: profile({ isError: true }) })).toBe('app')
  })
})
