// POST /functions/v1/prune-push-receipts   x-cron-secret: <PRUNE_RECEIPTS_SECRET>
//
// Not for clients. pg_cron runs public.run_push_receipt_pruning() every 30
// minutes, which POSTs here through pg_net with the secret from Vault
// (migration 20261113120000_push_receipts.sql). verify_jwt is off for this
// function in config.toml; the shared secret is checked in handler.ts.
//
// Secrets: PRUNE_RECEIPTS_SECRET (same value as the Vault secret
// prune_receipts_secret); optional EXPO_ACCESS_TOKEN.

import { adminClient } from '../_shared/http.ts'
import { fetchExpoReceipts } from '../_shared/push.ts'
import { handlePruneReceipts, type StoredTicket } from './handler.ts'

// Expo: receipts are usually ready within 15 minutes of sending.
const MIN_TICKET_AGE_MS = 15 * 60 * 1000

Deno.serve((req) => {
  const admin = adminClient()
  return handlePruneReceipts(req, {
    secret: Deno.env.get('PRUNE_RECEIPTS_SECRET') || null,
    async dueTickets(limit) {
      const before = new Date(Date.now() - MIN_TICKET_AGE_MS).toISOString()
      const { data, error } = await admin
        .from('push_tickets')
        .select('ticket_id, token')
        .lte('created_at', before)
        .order('created_at', { ascending: true })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as StoredTicket[]
    },
    getReceipts: fetchExpoReceipts,
    async deleteTokens(tokens) {
      const { error } = await admin.from('push_tokens').delete().in('token', tokens)
      if (error) throw error
    },
    async deleteTickets(ids) {
      // .in() puts ids in the URL; chunk to stay well under URL limits.
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await admin.from('push_tickets').delete().in('ticket_id', ids.slice(i, i + 200))
        if (error) throw error
      }
    },
    log: (message, details) => console.error(message, details ?? ''),
  })
})
