// Stores Expo "ok" tickets so prune-push-receipts can check their receipts
// later (migration 20261113120000_push_receipts.sql). Best effort: a failure is
// logged and never fails the send.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ExpoTicketRef } from './push.ts'

export async function storeTickets(admin: SupabaseClient, tickets: ExpoTicketRef[]): Promise<void> {
  if (tickets.length === 0) return
  const { error } = await admin
    .from('push_tickets')
    .upsert(tickets.map((t) => ({ ticket_id: t.id, token: t.token })), { onConflict: 'ticket_id', ignoreDuplicates: true })
  // e.g. a foreign-key error when the token was deleted (logout) mid-send.
  if (error) console.error('push_tickets insert failed', error)
}
