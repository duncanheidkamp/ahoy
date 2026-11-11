// POST /functions/v1/notify-friendship   Authorization: Bearer <user access token>
// Body: { "friendship_id": "<uuid>" }
//
// Called by the native app right after it creates a pending friend request
// (-> "@me wants to join your crew" to the addressee) or accepts one
// (-> "@me joined your crew" to the requester). The client only names the
// row; public.claim_friendship_notification() reads its current state, checks
// the caller's role in it, blocks, once-per-row, a 24 h per-pair cooldown and
// a per-requester hourly cap (migration 20261111120000).

import { adminClient, authenticate } from '../_shared/http.ts'
import { sendExpoMessages } from '../_shared/push.ts'
import { storeTickets } from '../_shared/tickets.ts'
import { handleNotifyFriendship, type ClaimResult } from './handler.ts'

Deno.serve((req) => {
  const admin = adminClient()
  return handleNotifyFriendship(req, {
    authenticate,
    async claim(callerId, friendshipId) {
      const { data, error } = await admin.rpc('claim_friendship_notification', {
        p_caller: callerId,
        p_friendship_id: friendshipId,
      })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as ClaimResult | undefined
      return row ?? { ok: false, reason: 'invalid_request', kind: null, recipient_id: null, actor_username: null }
    },
    async expoTokensFor(userId) {
      const { data } = await admin.from('push_tokens').select('token, platform').eq('user_id', userId)
      return (data ?? []).filter((t) => t.platform !== 'web').map((t) => t.token as string)
    },
    sendExpo: sendExpoMessages,
    async deleteTokens(tokens) {
      await admin.from('push_tokens').delete().in('token', tokens)
    },
    storeTickets: (tickets) => storeTickets(admin, tickets),
  })
})
