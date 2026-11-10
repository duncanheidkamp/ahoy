// Request handling for delete-account, with its I/O injected so it can be
// unit-tested (supabase/functions/_tests/delete_account_test.ts).

import { corsHeaders, json } from '../_shared/http.ts'
import type { RevokeResult } from './apple.ts'

export interface DeleteDeps {
  authenticate(req: Request): Promise<{ id: string } | null>
  deleteUser(userId: string): Promise<{ error: unknown }>
  /** null when the APPLE_* secrets aren't set. */
  revokeApple: ((authorizationCode: string) => Promise<RevokeResult>) | null
  log(message: string, details?: unknown): void
}

export async function handleDeleteAccount(req: Request, deps: DeleteDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const user = await deps.authenticate(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  // Body is optional (older clients send none).
  let code: string | null = null
  try {
    const body = (await req.json()) as { apple_authorization_code?: unknown } | null
    if (typeof body?.apple_authorization_code === 'string' && body.apple_authorization_code.length < 4096) {
      code = body.apple_authorization_code
    }
  } catch {
    // no / invalid JSON body: plain delete
  }

  // Best effort, before deleting: a failed revocation must never keep an
  // account alive the user asked us to delete.
  let apple: RevokeResult | 'not_configured' | 'skipped' = 'skipped'
  if (code) {
    if (!deps.revokeApple) {
      apple = 'not_configured'
      deps.log('apple revocation skipped: APPLE_* secrets not set')
    } else {
      try {
        apple = await deps.revokeApple(code)
      } catch (err) {
        apple = 'revoke_failed'
        deps.log('apple revocation threw', err)
      }
      if (apple !== 'revoked') deps.log(`apple revocation: ${apple}`)
    }
  }

  const { error } = await deps.deleteUser(user.id)
  if (error) {
    deps.log('deleteUser failed', error)
    return json({ error: 'delete_failed' }, 500)
  }

  return json({ ok: true, apple })
}
