// POST /functions/v1/send-ahoy   Authorization: Bearer <user access token>
// Body: { "receiver_id": "<uuid>" }
//
// The phrase is NOT accepted from the client — it is the sender's server-side
// active phrase. All rules (accepted friendship, no block, 30/min rate limit,
// phrase unlocked) are enforced in public.record_ahoy().

import { adminClient, authenticate, corsHeaders, json } from '../_shared/http.ts'
import { sendExpoPushes, sendFcmWebPush, type AhoyPush } from '../_shared/push.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REASON_STATUS: Record<string, number> = {
  not_friends: 403,
  blocked: 403, // reported to the client as not_friends so blocks stay private
  rate_limited: 429,
  invalid_request: 400,
  no_username: 403, // sender or receiver hasn't picked a username yet
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const user = await authenticate(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  let receiverId: unknown
  try {
    receiverId = (await req.json())?.receiver_id
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof receiverId !== 'string' || !UUID_RE.test(receiverId)) {
    return json({ error: 'receiver_id required' }, 400)
  }

  const admin = adminClient()

  const { data: rows, error: rpcError } = await admin.rpc('record_ahoy', {
    p_sender: user.id,
    p_receiver: receiverId,
  })
  if (rpcError) {
    console.error('record_ahoy failed', rpcError)
    return json({ error: 'send_failed' }, 500)
  }
  const result = (Array.isArray(rows) ? rows[0] : rows) as
    | { ok: boolean; reason: string | null; ahoy_id: string | null; phrase: string | null; sender_username: string | null }
    | undefined
  if (!result?.ok) {
    const reason = result?.reason ?? 'invalid_request'
    return json({ error: reason === 'blocked' ? 'not_friends' : reason }, REASON_STATUS[reason] ?? 400)
  }

  const push: AhoyPush = {
    phrase: result.phrase!,
    senderId: user.id,
    senderUsername: result.sender_username!,
  }

  // Delivery is best effort: the ahoy is already recorded.
  const [{ data: tokens }, { data: receiver }] = await Promise.all([
    admin.from('push_tokens').select('token, platform').eq('user_id', receiverId),
    admin.from('users').select('fcm_token').eq('id', receiverId).maybeSingle(),
  ])

  const expoTokens = (tokens ?? []).filter((t) => t.platform !== 'web').map((t) => t.token as string)
  const webTokens = new Set((tokens ?? []).filter((t) => t.platform === 'web').map((t) => t.token as string))
  const legacyFcm = (receiver?.fcm_token as string | null) ?? null
  if (legacyFcm) webTokens.add(legacyFcm)

  const [expo, ...fcmOutcomes] = await Promise.all([
    sendExpoPushes(expoTokens, push),
    ...[...webTokens].map(async (token) => ({ token, outcome: await sendFcmWebPush(token, push) })),
  ])

  // Prune dead tokens.
  const deadPushTokens = [
    ...expo.deadTokens,
    ...fcmOutcomes.filter((o) => o.outcome === 'unregistered').map((o) => o.token),
  ]
  const cleanup: PromiseLike<unknown>[] = []
  if (deadPushTokens.length > 0) {
    cleanup.push(admin.from('push_tokens').delete().in('token', deadPushTokens))
  }
  if (legacyFcm && deadPushTokens.includes(legacyFcm)) {
    cleanup.push(admin.from('users').update({ fcm_token: null }).eq('id', receiverId).eq('fcm_token', legacyFcm))
  }
  await Promise.all(cleanup)

  if (expo.errors.length > 0) console.error('expo push errors', expo.errors)

  return json({
    ok: true,
    ahoy_id: result.ahoy_id,
    phrase: result.phrase,
    delivered: {
      expo: expo.sent,
      web: fcmOutcomes.filter((o) => o.outcome === 'sent').length,
      pruned: deadPushTokens.length,
    },
  })
})
