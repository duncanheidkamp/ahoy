import { describe, expect, it, jest } from '@jest/globals'

import { createForegroundDispatcher, foregroundBehavior } from '@/lib/push/foreground'
import { dataOfNotification, parsePushData } from '@/lib/push/payload'

const note = (data: Record<string, unknown>, title = 'Yo!', body = '@alice') => ({
  request: { content: { title, body, data } },
})

describe('foreground notification handler', () => {
  it('suppresses the system banner/list/sound for our push types', () => {
    for (const data of [
      { type: 'ahoy', senderId: 's', senderUsername: 'alice' },
      { type: 'friend_request', friendshipId: 'f', actorId: 'a', actorUsername: 'x' },
      { type: 'friend_accepted', friendshipId: 'f', actorId: 'a', actorUsername: 'x' },
    ]) {
      expect(foregroundBehavior(parsePushData(data))).toEqual({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      })
    }
  })

  it('shows anything else normally, never touching the badge', () => {
    const b = foregroundBehavior(parsePushData({ hello: 'world' }))
    expect(b).toMatchObject({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
  })

  function setup() {
    const deps = { showBanner: jest.fn(), playAhoySound: jest.fn(), invalidate: jest.fn() }
    return { deps, dispatch: createForegroundDispatcher(deps) }
  }

  it('ahoy: in-app banner with sender + phrase, plays the sound, refreshes stats', () => {
    const { deps, dispatch } = setup()
    expect(dispatch(note({ type: 'ahoy', senderId: 's', senderUsername: 'alice' }))).toBe('ahoy')
    expect(deps.showBanner).toHaveBeenCalledWith({ title: 'Yo!', message: '@alice', route: '/' })
    expect(deps.playAhoySound).toHaveBeenCalledTimes(1)
    expect(deps.invalidate).toHaveBeenCalledWith(['stats', 'friendBadges'])
  })

  it('friend request: banner to Requests and refreshes the Requests query; no ahoy sound', () => {
    const { deps, dispatch } = setup()
    dispatch(
      note({ type: 'friend_request', friendshipId: 'f', actorId: 'a', actorUsername: 'erin' }, '', '@erin wants to join your crew')
    )
    expect(deps.showBanner).toHaveBeenCalledWith({
      title: 'Crew request',
      message: '@erin wants to join your crew',
      route: '/requests',
    })
    expect(deps.invalidate).toHaveBeenCalledWith(['requests'])
    expect(deps.playAhoySound).not.toHaveBeenCalled()
  })

  it('friend accepted: banner and crew refresh', () => {
    const { deps, dispatch } = setup()
    dispatch(note({ type: 'friend_accepted', friendshipId: 'f', actorId: 'a', actorUsername: 'erin' }, '', ''))
    expect(deps.showBanner).toHaveBeenCalledWith({ title: 'New crewmate', message: '@erin joined your crew', route: '/' })
    expect(deps.invalidate).toHaveBeenCalledWith(['friendBadges', 'stats', 'requests'])
  })

  it('unknown pushes do nothing in-app', () => {
    const { deps, dispatch } = setup()
    expect(dispatch(note({}))).toBe('unknown')
    expect(deps.showBanner).not.toHaveBeenCalled()
  })
})

describe('payload parsing', () => {
  it('reads data from content.data or the Android dataString', () => {
    expect(dataOfNotification(note({ type: 'ahoy', senderId: 's', senderUsername: 'a' }))).toEqual({
      type: 'ahoy',
      senderId: 's',
      senderUsername: 'a',
    })
    expect(
      dataOfNotification({ request: { content: { dataString: '{"type":"ahoy","senderId":"s","senderUsername":"a"}' } } })
    ).toEqual({ type: 'ahoy', senderId: 's', senderUsername: 'a' })
    expect(dataOfNotification({ request: { content: { dataString: '{nope' } } })).toEqual({ type: 'unknown' })
  })

  it('treats untyped pushes with a senderId (pre-Phase-3 server) as ahoys', () => {
    expect(parsePushData({ senderId: 's' })).toEqual({ type: 'ahoy', senderId: 's', senderUsername: '' })
  })

  it('rejects malformed data', () => {
    expect(parsePushData({ type: 'ahoy' })).toEqual({ type: 'unknown' })
    expect(parsePushData({ type: 'friend_request', friendshipId: 'f' })).toEqual({ type: 'unknown' })
    expect(parsePushData('x')).toEqual({ type: 'unknown' })
  })
})
