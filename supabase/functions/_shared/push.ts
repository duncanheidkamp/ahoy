// Push delivery: Expo Push API (native apps) and FCM HTTP v1 (legacy PWA).

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_BATCH = 100

export interface AhoyPush {
  phrase: string
  senderId: string
  senderUsername: string
}

export type FriendshipPushKind = 'request' | 'accepted'

export interface FriendshipPush {
  kind: FriendshipPushKind
  friendshipId: string
  actorId: string
  actorUsername: string
}

/** One Expo push message (subset of the fields we use). */
export interface ExpoMessage {
  to: string
  title?: string
  body: string
  sound: string | null
  priority: 'default' | 'normal' | 'high'
  channelId: string
  categoryId?: string
  threadId?: string
  data: Record<string, string>
}

// Native channel / category / sound names. The app creates the channels and
// registers the category at startup (mobile/lib/push/setup.ts); a push naming a
// channel the device doesn't have is NOT displayed on Android.
export const AHOY_CHANNEL_ID = 'ahoy-v1'
export const REQUESTS_CHANNEL_ID = 'requests-v1'
export const AHOY_CATEGORY_ID = 'ahoy'
export const AHOY_SOUND = 'ahoy.wav'

/**
 * An Ahoy. No badge (the app never sets one), no collapseId/tag (different
 * ahoys must never replace each other). threadId only groups visually on iOS,
 * per sender.
 */
export function ahoyMessage(to: string, push: AhoyPush): ExpoMessage {
  return {
    to,
    title: push.phrase,
    body: `@${push.senderUsername}`,
    sound: AHOY_SOUND,
    priority: 'high',
    channelId: AHOY_CHANNEL_ID,
    categoryId: AHOY_CATEGORY_ID,
    threadId: `ahoy-${push.senderId}`,
    data: { type: 'ahoy', senderId: push.senderId, senderUsername: push.senderUsername },
  }
}

/** "@x wants to join your crew" / "@x joined your crew". No title: iOS shows the app name. */
export function friendshipMessage(to: string, push: FriendshipPush): ExpoMessage {
  const request = push.kind === 'request'
  return {
    to,
    body: request ? `@${push.actorUsername} wants to join your crew` : `@${push.actorUsername} joined your crew`,
    sound: 'default',
    priority: 'high',
    channelId: REQUESTS_CHANNEL_ID,
    threadId: 'crew',
    data: {
      type: request ? 'friend_request' : 'friend_accepted',
      friendshipId: push.friendshipId,
      actorId: push.actorId,
      actorUsername: push.actorUsername,
    },
  }
}

export interface ExpoResult {
  sent: number
  /** Tokens Expo reported as DeviceNotRegistered — safe to delete. */
  deadTokens: string[]
  errors: string[]
}

export async function sendExpoMessages(messages: ExpoMessage[]): Promise<ExpoResult> {
  const result: ExpoResult = { sent: 0, deadTokens: [], errors: [] }
  if (messages.length === 0) return result

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  }
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const batch = messages.slice(i, i + EXPO_BATCH)
    try {
      const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(batch) })
      const payload = await res.json().catch(() => null) as
        | { data?: Array<{ status: 'ok' | 'error'; message?: string; details?: { error?: string } }>; errors?: unknown[] }
        | null
      if (!res.ok || !payload?.data) {
        result.errors.push(`expo http ${res.status}: ${JSON.stringify(payload?.errors ?? payload)}`)
        continue
      }
      // Tickets come back in the same order as the messages.
      payload.data.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          result.sent++
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          result.deadTokens.push(batch[idx].to)
        } else {
          result.errors.push(`${ticket.details?.error ?? 'error'}: ${ticket.message ?? ''}`)
        }
      })
    } catch (err) {
      result.errors.push(`expo fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return result
}

export function sendExpoPushes(tokens: string[], push: AhoyPush): Promise<ExpoResult> {
  return sendExpoMessages(tokens.map((to) => ahoyMessage(to, push)))
}

// ---------------------------------------------------------------------------
// FCM HTTP v1 (service account from the FCM_SERVICE_ACCOUNT secret, JSON)
// ---------------------------------------------------------------------------

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
  token_uri?: string
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null

function loadServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!raw) return null
  try {
    const sa = JSON.parse(raw) as ServiceAccount
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null
    return sa
  } catch {
    return null
  }
}

export function fcmConfigured(): boolean {
  return loadServiceAccount() !== null
}

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) return cachedAccessToken.token

  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token'
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }))
  const key = await importPrivateKey(sa.private_key)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))
  const assertion = `${header}.${claims}.${base64url(signature)}`

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`google oauth ${res.status}: ${await res.text()}`)
  const { access_token, expires_in } = await res.json() as { access_token: string; expires_in: number }
  cachedAccessToken = { token: access_token, expiresAt: now + (expires_in ?? 3600) }
  return access_token
}

export type FcmOutcome = 'sent' | 'unregistered' | 'error' | 'not_configured'

/** Sends the legacy PWA web-push notification (same content as the Next.js route). */
export async function sendFcmWebPush(token: string, push: AhoyPush): Promise<FcmOutcome> {
  const sa = loadServiceAccount()
  if (!sa) return 'not_configured'

  try {
    const accessToken = await getAccessToken(sa)
    const article = push.phrase === 'Ahoy!' ? 'n' : ''
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: push.phrase,
            body: `@${push.senderUsername} sent you a${article} ${push.phrase}`,
          },
          webpush: {
            notification: {
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-72.png',
              actions: [{ action: 'ahoy_back', title: 'Ahoy back!' }],
            },
            fcm_options: { link: '/dashboard' },
          },
          data: { type: 'ahoy', senderId: push.senderId, senderUsername: push.senderUsername },
        },
      }),
    })
    if (res.ok) return 'sent'

    const text = await res.text()
    if (res.status === 404 || text.includes('UNREGISTERED')) return 'unregistered'
    console.error('fcm send failed', res.status, text)
    return 'error'
  } catch (err) {
    console.error('fcm send threw', err)
    return 'error'
  }
}
