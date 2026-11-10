// Push token registration and logout cleanup, with the platform calls
// injected (real ones in lib/push/native.ts) so the ordering is testable.

import type { JsonStore } from '../kv'
import { STORAGE_KEYS } from './constants'

export interface RegisteredToken {
  token: string
  userId: string
}

export interface RegistrationDeps {
  store: JsonStore
  isDevice: boolean
  platform: 'ios' | 'android'
  deviceName: string | null
  projectId: string | null
  /** Android channels must exist before the token is requested. */
  channelsReady: Promise<void>
  isGranted(): Promise<boolean>
  getExpoPushToken(projectId: string): Promise<string>
  /** public.register_push_token(p_token, p_platform, p_device_name) */
  registerToken(token: string, platform: 'ios' | 'android', deviceName: string | null): Promise<void>
  /** delete from push_tokens where token = $1 (RLS: own rows only) */
  deleteToken(token: string): Promise<void>
  signOut(): Promise<void>
}

export type RegisterResult = 'registered' | 'no_permission' | 'not_device' | 'no_project_id' | 'error'

export async function registerForPush(deps: RegistrationDeps, userId: string): Promise<RegisterResult> {
  if (!deps.isDevice) return 'not_device'
  if (!deps.projectId) return 'no_project_id'
  try {
    if (!(await deps.isGranted())) return 'no_permission'
    await deps.channelsReady
    const token = await deps.getExpoPushToken(deps.projectId)
    // Upsert every time: re-binds the token to this user if the device
    // changed hands, and bumps updated_at so stale tokens are visible.
    await deps.registerToken(token, deps.platform, deps.deviceName)
    await deps.store.set(STORAGE_KEYS.registeredToken, { token, userId } satisfies RegisteredToken)
    return 'registered'
  } catch {
    return 'error'
  }
}

export const TOKEN_DELETE_TIMEOUT_MS = 5000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

/**
 * Logout: delete this device's push_tokens row WHILE STILL SIGNED IN (RLS
 * needs the user's JWT), then sign out. If the delete fails (offline) we
 * still sign out; the row then keeps pointing at the old user until someone
 * logs in on this device (register_push_token re-binds it) or Expo reports
 * the token dead.
 */
export async function signOutWithPushCleanup(deps: RegistrationDeps): Promise<{ tokenRemoved: boolean }> {
  let tokenRemoved = false
  try {
    const stored = await deps.store.get<RegisteredToken>(STORAGE_KEYS.registeredToken)
    let token = stored?.token ?? null
    if (!token && deps.isDevice && deps.projectId && (await deps.isGranted())) {
      token = await withTimeout(deps.getExpoPushToken(deps.projectId), TOKEN_DELETE_TIMEOUT_MS)
    }
    if (token) {
      await withTimeout(deps.deleteToken(token), TOKEN_DELETE_TIMEOUT_MS)
      tokenRemoved = true
    } else {
      tokenRemoved = true // nothing registered from this device
    }
  } catch {
    tokenRemoved = false
  }
  await deps.store.remove(STORAGE_KEYS.registeredToken).catch(() => {})
  await deps.signOut()
  return { tokenRemoved }
}
