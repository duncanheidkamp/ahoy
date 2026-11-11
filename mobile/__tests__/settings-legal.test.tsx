import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'

import { TERMS_OF_USE_URL } from '@/lib/legal'

// Settings pulls in Supabase queries, push and social-login natives; stub
// them so the screen renders on its own.
jest.mock('@/lib/auth', () => ({ useUserId: () => 'user-1' }))
jest.mock('@/lib/env', () => ({ LINKS_DOMAIN: 'ahoy.example' }))
jest.mock('@/components/toast', () => ({ useToast: () => () => {} }))
jest.mock('@/lib/push/native', () => ({
  getPermission: () => Promise.resolve({ granted: true, canAskAgain: true, status: 'granted' }),
  requestPermission: jest.fn(),
  registrationDeps: {},
}))
jest.mock('@/lib/push/registration', () => ({ registerForPush: jest.fn(), signOutWithPushCleanup: jest.fn() }))
jest.mock('@/lib/social-auth-native', () => ({ googleSignOut: jest.fn() }))
jest.mock('@/lib/app-version', () => ({ appVersionLabel: () => '1.0.0 (1)' }))
jest.mock('@/lib/queries', () => {
  const idle = { data: undefined, isLoading: false, isError: false }
  return {
    sendFeedback: jest.fn(),
    useBlockedUsers: () => ({ ...idle, data: [] }),
    useMyStats: () => ({ ...idle, data: { total_sent: 3, per_friend: {} } }),
    usePhrases: () => ({ ...idle, data: [] }),
    useProfile: () => ({ ...idle, data: { id: 'user-1', username: 'duncan', activePhrase: 'Ahoy!' } }),
    useSetActivePhrase: () => ({ isPending: false, variables: undefined, mutateAsync: jest.fn() }),
    useUnblockUser: () => ({ isPending: false, variables: undefined, mutateAsync: jest.fn() }),
  }
})

// eslint-disable-next-line import/first
import SettingsScreen from '@/app/(app)/settings'

describe('Settings legal links', () => {
  it('shows "Terms of use" as a link that opens Apple’s standard EULA', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    await render(<SettingsScreen />)
    const terms = await screen.findByRole('link', { name: 'Terms of use' })
    await fireEvent.press(terms)
    expect(open).toHaveBeenCalledWith(TERMS_OF_USE_URL)
  })

  it('still links the privacy policy on the links domain', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    await render(<SettingsScreen />)
    await fireEvent.press(await screen.findByRole('link', { name: 'Privacy policy' }))
    expect(open).toHaveBeenCalledWith('https://ahoy.example/privacy')
  })
})
