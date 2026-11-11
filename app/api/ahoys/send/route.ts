import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendPushNotification } from '@/lib/firebase/admin'
import { sendExpoPushes } from '@/lib/push/expo'
import type { SendAhoyFailure } from '@/lib/supabase/types'

// PWA send path. Same rules as the send-ahoy Edge Function: the phrase comes
// from the sender's server-side active phrase, and record_ahoy() enforces
// friendship, blocks and the rate limit.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FAILURE_STATUS: Record<SendAhoyFailure, number> = {
  not_friends: 403,
  blocked: 403,
  rate_limited: 429,
  invalid_request: 400,
  no_username: 403,
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const receiverId: unknown = body?.receiverId ?? body?.receiver_id

    if (typeof receiverId !== 'string' || !UUID_RE.test(receiverId)) {
      return NextResponse.json({ error: 'Receiver ID required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Caller is authenticated; the service role does the checked insert.
    const admin = createServiceClient()
    const { data: rows, error: rpcError } = await admin.rpc('record_ahoy', {
      p_sender: user.id,
      p_receiver: receiverId,
    })

    if (rpcError) {
      console.error('record_ahoy failed:', rpcError)
      return NextResponse.json({ error: 'Failed to send ahoy' }, { status: 500 })
    }

    const result = rows?.[0]
    if (!result?.ok) {
      const reason = result?.reason ?? 'invalid_request'
      // Don't reveal blocks.
      const publicReason = reason === 'blocked' ? 'not_friends' : reason
      return NextResponse.json({ error: publicReason }, { status: FAILURE_STATUS[reason] ?? 400 })
    }

    const phrase = result.phrase ?? 'Ahoy!'
    const senderUsername = result.sender_username ?? ''

    // Delivery is best effort: the ahoy is already recorded.
    const [{ data: tokens }, { data: receiver }] = await Promise.all([
      admin.from('push_tokens').select('token, platform').eq('user_id', receiverId),
      admin.from('users').select('fcm_token').eq('id', receiverId).maybeSingle(),
    ])

    const expoTokens = (tokens ?? []).filter((t) => t.platform !== 'web').map((t) => t.token)
    const webTokens = new Set((tokens ?? []).filter((t) => t.platform === 'web').map((t) => t.token))
    const legacyFcm = receiver?.fcm_token ?? null
    if (legacyFcm) webTokens.add(legacyFcm)

    const [expo, ...fcm] = await Promise.all([
      sendExpoPushes(expoTokens, { phrase, senderId: user.id, senderUsername }),
      ...[...webTokens].map(async (token) => ({
        token,
        outcome: await sendPushNotification(
          token,
          phrase,
          `@${senderUsername} sent you a${phrase === 'Ahoy!' ? 'n' : ''} ${phrase}`,
          { type: 'ahoy', senderId: user.id, senderUsername }
        ),
      })),
    ])

    const dead = [...expo.deadTokens, ...fcm.filter((f) => f.outcome === 'unregistered').map((f) => f.token)]
    const cleanup: PromiseLike<unknown>[] = []
    // Ok tickets get their receipts checked later (prune-push-receipts).
    if (expo.tickets.length > 0) {
      cleanup.push(
        admin
          .from('push_tickets')
          .upsert(
            expo.tickets.map((t) => ({ ticket_id: t.id, token: t.token })),
            { onConflict: 'ticket_id', ignoreDuplicates: true }
          )
          .then(({ error }) => {
            if (error) console.error('push_tickets insert failed:', error)
          })
      )
    }
    if (dead.length > 0) cleanup.push(admin.from('push_tokens').delete().in('token', dead))
    if (legacyFcm && dead.includes(legacyFcm)) {
      cleanup.push(admin.from('users').update({ fcm_token: null }).eq('id', receiverId).eq('fcm_token', legacyFcm))
    }
    await Promise.all(cleanup)
    if (expo.errors.length > 0) console.error('Expo push errors:', expo.errors)

    return NextResponse.json({ success: true, phrase })
  } catch (error) {
    console.error('Error sending ahoy:', error)
    return NextResponse.json({ error: 'Failed to send ahoy' }, { status: 500 })
  }
}
