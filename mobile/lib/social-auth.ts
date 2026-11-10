// Sign in with Apple / Google -> supabase.auth.signInWithIdToken. The native
// SDK calls are injected (real ones in lib/social-auth-native.ts) so the
// nonce handling and the flows are unit-testable.
//
// Apple nonce: Apple puts SHA-256(nonce) in the identity token's `nonce`
// claim, so Apple gets the HASHED nonce and Supabase gets the RAW one (it
// hashes it and compares).

export type Provider = 'apple' | 'google'

export type SocialResult =
  | { status: 'signed_in' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export interface IdTokenSignIn {
  (args: { provider: Provider; token: string; nonce?: string }): Promise<{ error: { message: string } | null }>
}

export interface NonceDeps {
  randomBytes(count: number): Uint8Array
  /** Lowercase hex SHA-256 of a UTF-8 string. */
  sha256Hex(input: string): Promise<string>
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createNonce(deps: NonceDeps): Promise<{ raw: string; hashed: string }> {
  const raw = toHex(deps.randomBytes(32))
  const hashed = await deps.sha256Hex(raw)
  return { raw, hashed }
}

export interface AppleDeps extends NonceDeps {
  /** AppleAuthentication.signInAsync with the hashed nonce. Rejects with code ERR_REQUEST_CANCELED on cancel. */
  appleSignIn(hashedNonce: string): Promise<{ identityToken: string | null }>
  signInWithIdToken: IdTokenSignIn
}

function errorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined
}

export async function signInWithApple(deps: AppleDeps): Promise<SocialResult> {
  const nonce = await createNonce(deps)
  let credential
  try {
    credential = await deps.appleSignIn(nonce.hashed)
  } catch (e) {
    if (errorCode(e) === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' }
    return { status: 'error', message: 'Sign in with Apple failed — try again' }
  }
  if (!credential.identityToken) return { status: 'error', message: 'Apple didn’t return a sign-in token' }
  const { error } = await deps.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: nonce.raw })
  if (error) return { status: 'error', message: 'Couldn’t sign in — try again' }
  return { status: 'signed_in' }
}

export type GoogleSignInOutcome = { type: 'success'; idToken: string | null } | { type: 'cancelled' }

export interface GoogleDeps {
  /** Android: make sure Play Services are there (shows the update dialog). */
  ensurePlayServices(): Promise<void>
  googleSignIn(): Promise<GoogleSignInOutcome>
  signInWithIdToken: IdTokenSignIn
}

export const GOOGLE_CANCEL_CODES = ['SIGN_IN_CANCELLED', 'IN_PROGRESS', '-5', '12501']

export async function signInWithGoogle(deps: GoogleDeps): Promise<SocialResult> {
  let outcome: GoogleSignInOutcome
  try {
    await deps.ensurePlayServices()
    outcome = await deps.googleSignIn()
  } catch (e) {
    const code = errorCode(e)
    if (code && GOOGLE_CANCEL_CODES.includes(code)) return { status: 'cancelled' }
    if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
      return { status: 'error', message: 'Google Play services are needed for Google sign-in' }
    }
    return { status: 'error', message: 'Google sign-in failed — try again' }
  }
  if (outcome.type === 'cancelled') return { status: 'cancelled' }
  if (!outcome.idToken) return { status: 'error', message: 'Google didn’t return a sign-in token' }
  // No nonce: the Google iOS SDK sets its own and doesn't expose it, so the
  // Supabase Google provider needs "Skip nonce checks" on (README).
  const { error } = await deps.signInWithIdToken({ provider: 'google', token: outcome.idToken })
  if (error) return { status: 'error', message: 'Couldn’t sign in — try again' }
  return { status: 'signed_in' }
}

export interface ProviderInput {
  platform: 'ios' | 'android' | string
  appleAvailable: boolean
  googleClientIds: { web: string; ios: string; android: string }
}

/**
 * Which buttons to show.
 *  - Apple: iOS only (native sheet). Hidden on Android — see README
 *    "Social login" for why the web flow isn't offered there.
 *  - Google: needs the web client ID (the idToken audience Supabase checks)
 *    plus the platform's own client ID.
 *  - App Store guideline 4.8: on iOS, Google is only offered alongside Apple.
 */
export function availableProviders({ platform, appleAvailable, googleClientIds }: ProviderInput): Provider[] {
  const apple = platform === 'ios' && appleAvailable
  const googleConfigured =
    !!googleClientIds.web &&
    ((platform === 'ios' && !!googleClientIds.ios) || (platform === 'android' && !!googleClientIds.android))
  const google = googleConfigured && (platform !== 'ios' || apple)
  const out: Provider[] = []
  if (apple) out.push('apple')
  if (google) out.push('google')
  return out
}
