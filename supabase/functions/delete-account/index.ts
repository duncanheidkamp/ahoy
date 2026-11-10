// POST /functions/v1/delete-account   Authorization: Bearer <user access token>
//
// Permanently deletes the caller's account. Deleting the auth.users row
// cascades to public.users and from there to friendships, blocks,
// push_tokens, feedback and the user's sent ahoys. Ahoys they received are
// kept with receiver_id = null so friends' counts don't drop
// (see migration 20261110180700_account_deletion.sql).

import { adminClient, authenticate, corsHeaders, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const user = await authenticate(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const { error } = await adminClient().auth.admin.deleteUser(user.id)
  if (error) {
    console.error('deleteUser failed', error)
    return json({ error: 'delete_failed' }, 500)
  }

  return json({ ok: true })
})
