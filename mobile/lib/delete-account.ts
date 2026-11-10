// Account deletion (Settings -> Delete account). Apple requires in-app
// deletion for apps with account creation (guideline 5.1.1(v)).

import { normalizeUsername } from './username'

/** The confirm field must match the username (case/@/space-insensitive). */
export function canConfirmDelete(typed: string, username: string | null | undefined): boolean {
  if (!username) return false
  return normalizeUsername(typed.replace(/^\s*@/, '')) === username
}

export interface DeleteAccountDeps {
  /** iOS + Apple account: a fresh authorization code for token revocation, else null. Never throws. */
  getAppleAuthorizationCode(): Promise<string | null>
  /** functions.invoke('delete-account'). */
  invokeDelete(body: { apple_authorization_code?: string }): Promise<{ error: unknown }>
  /** Device state: stored keys, Google session, query cache. Best effort. */
  clearLocalState(): Promise<void>
  /** Local sign-out only (the server session no longer exists). */
  signOutLocal(): Promise<void>
}

export type DeleteAccountResult = 'deleted' | 'failed'

export async function deleteAccount(deps: DeleteAccountDeps): Promise<DeleteAccountResult> {
  const code = await deps.getAppleAuthorizationCode().catch(() => null)
  const { error } = await deps.invokeDelete(code ? { apple_authorization_code: code } : {})
  if (error) return 'failed'
  // The account is gone; from here on nothing may stop the sign-out.
  await deps.clearLocalState().catch(() => {})
  await deps.signOutLocal().catch(() => {})
  return 'deleted'
}
