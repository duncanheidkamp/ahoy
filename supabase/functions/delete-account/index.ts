// POST /functions/v1/delete-account   Authorization: Bearer <user access token>
// Body (optional): { "apple_authorization_code": "<fresh code from Sign in with Apple>" }
//
// Permanently deletes the caller's account. Deleting the auth.users row
// cascades to public.users and from there to friendships, blocks,
// push_tokens, feedback, the reports they filed and the user's sent ahoys.
// Ahoys they received are kept with receiver_id = null so friends' counts
// don't drop (see migration 20261110180700_account_deletion.sql); reports
// about them are kept with reported_id = null.
//
// If an Apple authorization code is sent and the APPLE_* secrets are set, the
// user's Sign in with Apple tokens are revoked first (see apple.ts).

import { adminClient, authenticate } from '../_shared/http.ts'
import { appleConfigFromEnv, revokeAppleAuthorizationCode } from './apple.ts'
import { handleDeleteAccount } from './handler.ts'

Deno.serve((req) => {
  const appleConfig = appleConfigFromEnv((name) => Deno.env.get(name))
  return handleDeleteAccount(req, {
    authenticate,
    deleteUser: (id) => adminClient().auth.admin.deleteUser(id),
    revokeApple: appleConfig ? (code) => revokeAppleAuthorizationCode(appleConfig, code) : null,
    log: (message, details) => console.error(message, details ?? ''),
  })
})
