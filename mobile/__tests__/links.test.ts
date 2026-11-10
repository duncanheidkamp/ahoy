import { describe, expect, it } from '@jest/globals'

import { memoryStore } from '@/lib/kv'
import {
  createPendingInvites,
  inviteMessage,
  inviteUrl,
  parseInviteUrl,
  parseInviteUsername,
  PENDING_LINK_KEY,
  PENDING_LINK_TTL_MS,
} from '@/lib/links'

const DOMAIN = 'ahoy.example'

describe('invite URLs', () => {
  it('builds https://<domain>/add/<username>', () => {
    expect(inviteUrl('captain_d', DOMAIN)).toBe('https://ahoy.example/add/captain_d')
    expect(inviteMessage('captain_d', 'links.ahoy.app')).toBe('Join my crew on Ahoy! https://links.ahoy.app/add/captain_d')
  })
})

describe('parseInviteUsername (route param)', () => {
  it.each([
    ['bob', 'bob'],
    ['Bob', 'bob'],
    ['@bob', 'bob'],
    ['%40Captain_D', 'captain_d'],
    [['alice', 'x'], 'alice'],
  ])('%p -> %p', (raw, expected) => {
    expect(parseInviteUsername(raw as string)).toBe(expected)
  })

  it.each([undefined, '', 'ab', 'a'.repeat(21), 'bob!', 'bo b', '%E0%A4%A', '../x'])('rejects %p', (raw) => {
    expect(parseInviteUsername(raw)).toBeNull()
  })
})

describe('parseInviteUrl (universal link + custom scheme)', () => {
  it.each([
    ['https://ahoy.example/add/bob', 'bob'],
    ['https://AHOY.example/add/Bob/', 'bob'],
    ['https://ahoy.example/add/bob?utm=sms#x', 'bob'],
    ['ahoy://add/bob', 'bob'],
    ['ahoy://add/Bob/', 'bob'],
  ])('%p -> %p', (url, expected) => {
    expect(parseInviteUrl(url, DOMAIN)).toBe(expected)
  })

  it.each([
    'https://evil.example/add/bob',
    'https://ahoy.example/settings',
    'https://ahoy.example/add/bob/extra',
    'http://ahoy.example/add/bob',
    'ahoy://requests',
    'ahoy://add/no',
  ])('rejects %p', (url) => {
    expect(parseInviteUrl(url, DOMAIN)).toBeNull()
  })
})

describe('pending invite after login / username pick', () => {
  it('remembers a link opened while signed out and resumes it once', async () => {
    const store = memoryStore()
    const pending = createPendingInvites(store, () => 1_000)
    await pending.save('Bob')
    expect(store.data[PENDING_LINK_KEY]).toEqual({ username: 'bob', savedAt: 1_000 })
    expect(await pending.take()).toBe('bob')
    expect(await pending.take()).toBeNull()
  })

  it('a newer link replaces an older one', async () => {
    const pending = createPendingInvites(memoryStore())
    await pending.save('alice')
    await pending.save('carol')
    expect(await pending.take()).toBe('carol')
  })

  it('ignores invalid names', async () => {
    const store = memoryStore()
    await createPendingInvites(store).save('x!')
    expect(store.data[PENDING_LINK_KEY]).toBeUndefined()
  })

  it('expires after the TTL (and is cleared)', async () => {
    let now = 0
    const store = memoryStore()
    const pending = createPendingInvites(store, () => now)
    await pending.save('bob')
    now = PENDING_LINK_TTL_MS + 1
    expect(await pending.take()).toBeNull()
    expect(store.data[PENDING_LINK_KEY]).toBeUndefined()
  })

  it('tolerates junk in storage', async () => {
    const pending = createPendingInvites(memoryStore({ [PENDING_LINK_KEY]: { username: 'DROP;', savedAt: 'x' } }))
    expect(await pending.take()).toBeNull()
  })
})
