// Push delivery through the Expo Push API (the native apps). Expo hands
// Android pushes to FCM and iOS pushes to APNs with the credentials stored in
// EAS; nothing here talks to FCM directly.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const EXPO_BATCH = 100
/** Expo's limit for one getReceipts request. */
export const EXPO_RECEIPT_BATCH = 1000

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

/** An "ok" ticket: the id to fetch its receipt with later, and the token it was sent to. */
export interface ExpoTicketRef {
  id: string
  token: string
}

export interface ExpoResult {
  sent: number
  /** Tokens Expo reported as DeviceNotRegistered — safe to delete. */
  deadTokens: string[]
  /** Ok tickets with an id, to be stored in push_tickets for the receipts check. */
  tickets: ExpoTicketRef[]
  errors: string[]
}

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  }
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN')
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  return headers
}

export async function sendExpoMessages(messages: ExpoMessage[]): Promise<ExpoResult> {
  const result: ExpoResult = { sent: 0, deadTokens: [], tickets: [], errors: [] }
  if (messages.length === 0) return result
  const headers = expoHeaders()

  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const batch = messages.slice(i, i + EXPO_BATCH)
    try {
      const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(batch) })
      const payload = await res.json().catch(() => null) as
        | {
          data?: Array<{ status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } }>
          errors?: unknown[]
        }
        | null
      if (!res.ok || !payload?.data) {
        result.errors.push(`expo http ${res.status}: ${JSON.stringify(payload?.errors ?? payload)}`)
        continue
      }
      // Tickets come back in the same order as the messages.
      payload.data.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          result.sent++
          if (ticket.id) result.tickets.push({ id: ticket.id, token: batch[idx].to })
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

/** A push receipt (https://docs.expo.dev/push-notifications/sending-notifications/#push-receipts). */
export interface ExpoReceipt {
  status: 'ok' | 'error'
  message?: string
  details?: { error?: string }
}

/**
 * One getReceipts call for at most EXPO_RECEIPT_BATCH ids. Ids whose receipt
 * isn't ready (or has expired) are simply missing from the result. Throws on
 * an HTTP/network error so the caller keeps those tickets for the next run.
 */
export async function fetchExpoReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
  if (ids.length === 0) return {}
  if (ids.length > EXPO_RECEIPT_BATCH) throw new Error(`at most ${EXPO_RECEIPT_BATCH} receipt ids per request`)
  const res = await fetch(EXPO_RECEIPTS_URL, { method: 'POST', headers: expoHeaders(), body: JSON.stringify({ ids }) })
  const payload = await res.json().catch(() => null) as
    | { data?: Record<string, ExpoReceipt>; errors?: unknown[] }
    | null
  if (!res.ok || !payload?.data) {
    throw new Error(`expo receipts http ${res.status}: ${JSON.stringify(payload?.errors ?? payload)}`)
  }
  return payload.data
}
