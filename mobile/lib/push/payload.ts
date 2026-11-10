// Parsing push payloads. Pure — no expo imports — so it is unit-testable and
// safe to use from the Android headless task.
//
// Shapes we see:
//   * listener / getLastNotificationResponseAsync: a mapped NotificationResponse,
//     data at notification.request.content.data (already an object)
//   * Android background task: the raw serialized response, where data may be
//     a JSON string at notification.request.content.dataString, or a flat
//     string map at content.data

export type PushData =
  | { type: 'ahoy'; senderId: string; senderUsername: string }
  | { type: 'friend_request'; friendshipId: string; actorId: string; actorUsername: string }
  | { type: 'friend_accepted'; friendshipId: string; actorId: string; actorUsername: string }
  | { type: 'unknown' }

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export function parsePushData(raw: unknown): PushData {
  if (!raw || typeof raw !== 'object') return { type: 'unknown' }
  const d = raw as Record<string, unknown>
  if (d.type === 'ahoy' && str(d.senderId)) {
    return { type: 'ahoy', senderId: d.senderId, senderUsername: str(d.senderUsername) ? d.senderUsername : '' }
  }
  if ((d.type === 'friend_request' || d.type === 'friend_accepted') && str(d.friendshipId) && str(d.actorId)) {
    return {
      type: d.type,
      friendshipId: d.friendshipId,
      actorId: d.actorId,
      actorUsername: str(d.actorUsername) ? d.actorUsername : '',
    }
  }
  // Pre-Phase-3 ahoy pushes had no type but did carry senderId.
  if (d.type === undefined && str(d.senderId)) {
    return { type: 'ahoy', senderId: d.senderId, senderUsername: str(d.senderUsername) ? d.senderUsername : '' }
  }
  return { type: 'unknown' }
}

interface ContentLike {
  data?: unknown
  dataString?: unknown
  title?: unknown
  body?: unknown
}

function contentOf(notification: unknown): ContentLike | null {
  const n = notification as { request?: { content?: ContentLike } } | null | undefined
  return n?.request?.content ?? null
}

/** Data of a notification (mapped or raw). */
export function dataOfNotification(notification: unknown): PushData {
  const content = contentOf(notification)
  if (!content) return { type: 'unknown' }
  const fromData = parsePushData(content.data)
  if (fromData.type !== 'unknown') return fromData
  if (typeof content.dataString === 'string') {
    try {
      return parsePushData(JSON.parse(content.dataString))
    } catch {
      return { type: 'unknown' }
    }
  }
  return { type: 'unknown' }
}

export interface NormalizedResponse {
  /** Dedupe key: one handling per (notification, action). */
  key: string
  requestId: string
  actionIdentifier: string
  data: PushData
}

/** Accepts a NotificationResponse from any source; null if it isn't one. */
export function normalizeResponse(raw: unknown): NormalizedResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { actionIdentifier?: unknown; notification?: { request?: { identifier?: unknown } } }
  const actionIdentifier = r.actionIdentifier
  const requestId = r.notification?.request?.identifier
  if (!str(actionIdentifier) || !str(requestId)) return null
  return {
    key: `${requestId}::${actionIdentifier}`,
    requestId,
    actionIdentifier,
    data: dataOfNotification(r.notification),
  }
}
