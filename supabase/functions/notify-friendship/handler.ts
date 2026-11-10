// Request handling for notify-friendship, with its I/O injected so it can be
// unit-tested (supabase/functions/_tests/notify_friendship_test.ts).

import { corsHeaders, json } from '../_shared/http.ts'
import { friendshipMessage, type ExpoMessage, type ExpoResult, type FriendshipPushKind } from '../_shared/push.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ClaimResult {
  ok: boolean
  reason: string | null
  kind: FriendshipPushKind | null
  recipient_id: string | null
  actor_username: string | null
}

export interface NotifyDeps {
  /** Verified caller id from the JWT, or null. */
  authenticate(req: Request): Promise<{ id: string } | null>
  /** public.claim_friendship_notification(caller, friendship) via the service role. */
  claim(callerId: string, friendshipId: string): Promise<ClaimResult>
  expoTokensFor(userId: string): Promise<string[]>
  sendExpo(messages: ExpoMessage[]): Promise<ExpoResult>
  deleteTokens(tokens: string[]): Promise<void>
}

// Refusals the app may see. It fires and forgets, so these are informational;
// 'already_notified' is a normal outcome (e.g. a retry) and returns 200.
const REASON_STATUS: Record<string, number> = {
  invalid_request: 400,
  not_found: 404,
  not_notifiable: 409,
  rate_limited: 429,
}

export async function handleNotifyFriendship(req: Request, deps: NotifyDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const user = await deps.authenticate(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  let friendshipId: unknown
  try {
    friendshipId = (await req.json())?.friendship_id
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof friendshipId !== 'string' || !UUID_RE.test(friendshipId)) {
    return json({ error: 'friendship_id required' }, 400)
  }

  let claim: ClaimResult
  try {
    claim = await deps.claim(user.id, friendshipId)
  } catch (err) {
    console.error('claim_friendship_notification failed', err)
    return json({ error: 'notify_failed' }, 500)
  }

  if (!claim.ok) {
    const reason = claim.reason ?? 'invalid_request'
    if (reason === 'already_notified') return json({ ok: true, notified: false, reason })
    return json({ error: reason }, REASON_STATUS[reason] ?? 400)
  }

  // Best effort from here: the claim is recorded, so a failed delivery is not
  // retried (that is what makes repeated calls harmless).
  const tokens = await deps.expoTokensFor(claim.recipient_id!)
  const messages = tokens.map((to) =>
    friendshipMessage(to, {
      kind: claim.kind!,
      friendshipId,
      actorId: user.id,
      actorUsername: claim.actor_username!,
    })
  )
  const result = await deps.sendExpo(messages)
  if (result.deadTokens.length > 0) await deps.deleteTokens(result.deadTokens)
  if (result.errors.length > 0) console.error('expo push errors', result.errors)

  return json({ ok: true, notified: true, kind: claim.kind, delivered: result.sent, pruned: result.deadTokens.length })
}
