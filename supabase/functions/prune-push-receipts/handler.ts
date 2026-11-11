// Request handling for prune-push-receipts, with its I/O injected so it can be
// unit-tested (supabase/functions/_tests/prune_push_receipts_test.ts).
//
// Fetches Expo receipts for stored tickets that are old enough, deletes the
// push tokens whose receipt says DeviceNotRegistered, and forgets every ticket
// that got a receipt. Tickets without a receipt yet stay for the next run;
// public.run_push_receipt_pruning() purges them after 24 h either way.

import { json } from '../_shared/http.ts'
import { EXPO_RECEIPT_BATCH, type ExpoReceipt } from '../_shared/push.ts'

/** Most tickets checked per run (the job runs every 30 min; the crew is small). */
export const MAX_TICKETS_PER_RUN = 5000

export interface StoredTicket {
  ticket_id: string
  token: string
}

export interface PruneDeps {
  /** Shared secret from the PRUNE_RECEIPTS_SECRET function secret; null if unset. */
  secret: string | null
  /** Tickets created at least ~15 minutes ago, oldest first. */
  dueTickets(limit: number): Promise<StoredTicket[]>
  /** One getReceipts request (≤ EXPO_RECEIPT_BATCH ids). */
  getReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>>
  deleteTokens(tokens: string[]): Promise<void>
  deleteTickets(ids: string[]): Promise<void>
  log(message: string, details?: unknown): void
}

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export async function handlePruneReceipts(req: Request, deps: PruneDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  // Called only by pg_cron (via pg_net) with the shared secret. The gateway's
  // JWT check is off for this function (config.toml), so this IS the auth.
  if (!deps.secret) return json({ error: 'not_configured' }, 503)
  const given = req.headers.get('x-cron-secret') ?? ''
  if (!safeEqual(given, deps.secret)) return json({ error: 'unauthorized' }, 401)

  const tickets = await deps.dueTickets(MAX_TICKETS_PER_RUN)
  const tokenFor = new Map(tickets.map((t) => [t.ticket_id, t.token]))
  const ids = [...tokenFor.keys()]

  const done: string[] = []
  const dead = new Set<string>()
  const errors: string[] = []
  let failedBatches = 0

  for (let i = 0; i < ids.length; i += EXPO_RECEIPT_BATCH) {
    const batch = ids.slice(i, i + EXPO_RECEIPT_BATCH)
    let receipts: Record<string, ExpoReceipt>
    try {
      receipts = await deps.getReceipts(batch)
    } catch (err) {
      // Keep this batch's tickets; the next run retries them.
      failedBatches++
      deps.log('expo getReceipts failed', String(err))
      continue
    }
    for (const id of batch) {
      const receipt = receipts[id]
      if (!receipt) continue // not ready yet
      done.push(id)
      if (receipt.status === 'ok') continue
      if (receipt.details?.error === 'DeviceNotRegistered') dead.add(tokenFor.get(id)!)
      else errors.push(`${receipt.details?.error ?? 'error'}: ${receipt.message ?? ''}`)
    }
  }

  // Tokens first: their tickets cascade away with them.
  if (dead.size > 0) await deps.deleteTokens([...dead])
  if (done.length > 0) await deps.deleteTickets(done)
  if (errors.length > 0) deps.log('expo receipt errors', errors)

  return json({
    ok: true,
    checked: ids.length,
    receipts: done.length,
    pruned: dead.size,
    pending: ids.length - done.length,
    failed_batches: failedBatches,
  })
}
