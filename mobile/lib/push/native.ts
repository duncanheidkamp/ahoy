// The real (expo / supabase) implementations behind lib/push/*. Everything
// here is importable from the Android headless task: no React, no router.

import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications'
import { AppState, Platform } from 'react-native'

import { kv } from '../kv'
import { SendAhoyError, sendAhoy } from '../queries'
import { supabase } from '../supabase'
import { createAhoyBackQueue, type SendOutcome } from './ahoy-back'
import {
  AHOY_BACK_ACTION_ID,
  AHOY_CATEGORY_ID,
  AHOY_CHANNEL_ID,
  AHOY_SOUND_FILE,
  REQUESTS_CHANNEL_ID,
} from './constants'
import { createDedupe } from './dedupe'
import { pushEvents, pushRoutes } from './events'
import { foregroundBehavior } from './foreground'
import { dataOfNotification } from './payload'
import type { RegistrationDeps } from './registration'
import { createResponseHandler } from './responses'
import { ensureFreshSession } from './session'

export const projectId: string | null =
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
  Constants.easConfig?.projectId ??
  null

// ---------------------------------------------------------------------------
// Channels (Android) — created at startup, before any token request. A push
// naming a channel that doesn't exist yet is not displayed.

async function createChannels() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(AHOY_CHANNEL_ID, {
    name: 'Ahoys',
    description: 'When your crew hails you',
    importance: AndroidImportance.HIGH,
    sound: AHOY_SOUND_FILE,
    enableVibrate: true,
    vibrationPattern: [0, 180, 120, 180],
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
  })
  await Notifications.setNotificationChannelAsync(REQUESTS_CHANNEL_ID, {
    name: 'Crew requests',
    description: 'Friend requests and new crewmates',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
  })
}

let channels: Promise<void> | null = null
export function channelsReady(): Promise<void> {
  channels ??= createChannels().catch(() => {})
  return channels
}

// ---------------------------------------------------------------------------
// Handler + category

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => foregroundBehavior(dataOfNotification(notification)),
  })
  Notifications.setNotificationCategoryAsync(AHOY_CATEGORY_ID, [
    {
      identifier: AHOY_BACK_ACTION_ID,
      buttonTitle: 'Ahoy back!',
      // Runs without opening the app (and from the lock screen on iOS, since
      // isAuthenticationRequired defaults to false). See README for when the
      // OS actually gives us time to run.
      options: { opensAppToForeground: false },
    },
  ]).catch(() => {})
  void channelsReady()
}

// ---------------------------------------------------------------------------
// Sending from a notification action

export async function sendFromNotification(receiverId: string): Promise<SendOutcome> {
  const fresh = await ensureFreshSession(supabase.auth)
  if (fresh === 'signed_out') return { ok: false, failure: 'signed_out' }
  // Couldn't refresh (probably offline): keep the intent for the next foreground.
  if (fresh === 'refresh_failed') return { ok: false, failure: 'network' }
  try {
    await sendAhoy(receiverId)
    pushEvents.emit({ type: 'sent', receiverId })
    return { ok: true }
  } catch (e) {
    return { ok: false, failure: e instanceof SendAhoyError ? e.failure : 'unknown' }
  }
}

export const ahoyBackQueue = createAhoyBackQueue({ store: kv, send: sendFromNotification })

export const responseHandler = createResponseHandler({
  dedupe: createDedupe(kv),
  ahoyBack: ahoyBackQueue,
  dismiss: (id) => Notifications.dismissNotificationAsync(id),
  navigate: (route) => pushRoutes.request(route),
  notify: (message) => pushEvents.emit({ type: 'toast', message }),
  isForeground: () => AppState.currentState === 'active',
})

/** Handles (once) whatever response launched or last resumed the app. */
export async function checkLastNotificationResponse() {
  try {
    const last = await Notifications.getLastNotificationResponseAsync()
    if (!last) return
    await responseHandler.handle(last, 'last-response')
    await Notifications.clearLastNotificationResponseAsync()
  } catch {
    // Nothing to recover; a missed tap just doesn't navigate.
  }
}

// ---------------------------------------------------------------------------
// Registration

export async function getPermission() {
  const p = await Notifications.getPermissionsAsync()
  return { status: p.status, canAskAgain: p.canAskAgain, granted: p.granted }
}

export async function requestPermission() {
  const p = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: true },
  })
  return { status: p.status, canAskAgain: p.canAskAgain, granted: p.granted }
}

export const registrationDeps: RegistrationDeps = {
  store: kv,
  isDevice: Device.isDevice,
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  deviceName: Device.deviceName ?? Device.modelName ?? null,
  projectId,
  get channelsReady() {
    return channelsReady()
  },
  isGranted: async () => (await Notifications.getPermissionsAsync()).granted,
  getExpoPushToken: async (id) => (await Notifications.getExpoPushTokenAsync({ projectId: id })).data,
  registerToken: async (token, platform, deviceName) => {
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: platform,
      p_device_name: deviceName,
    })
    if (error) throw error
  },
  deleteToken: async (token) => {
    const { error } = await supabase.from('push_tokens').delete().eq('token', token)
    if (error) throw error
  },
  signOut: async () => {
    // Clears the local session even if the network call fails.
    await supabase.auth.signOut()
  },
}
