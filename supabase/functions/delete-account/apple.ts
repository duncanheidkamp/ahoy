// Sign in with Apple token revocation (App Store guideline 5.1.1(v): apps
// offering Sign in with Apple must revoke the user's Apple tokens when they
// delete their account).
//
// Flow: the iOS app gets a fresh authorizationCode from
// AppleAuthentication.signInAsync() right before deleting, sends it here, and
// we exchange it for a refresh token and revoke that:
//   POST https://appleid.apple.com/auth/token  (grant_type=authorization_code)
//   POST https://appleid.apple.com/auth/revoke (token_type_hint=refresh_token)
// Both need a client secret: an ES256 JWT signed with the Sign in with Apple
// key (.p8). Secrets: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8
// contents) and APPLE_CLIENT_ID (the iOS bundle id, com.duncanheidkamp.ahoy —
// native sign-in tokens are issued to the bundle id).

const APPLE = 'https://appleid.apple.com'

export interface AppleConfig {
  teamId: string
  keyId: string
  clientId: string
  privateKeyPem: string
}

export function appleConfigFromEnv(env: (name: string) => string | undefined): AppleConfig | null {
  const teamId = env('APPLE_TEAM_ID')
  const keyId = env('APPLE_KEY_ID')
  const clientId = env('APPLE_CLIENT_ID')
  const privateKeyPem = env('APPLE_PRIVATE_KEY')
  if (!teamId || !keyId || !clientId || !privateKeyPem) return null
  return { teamId, keyId, clientId, privateKeyPem }
}

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let bin = ''
  for (const b of raw) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  // Secrets set from a shell often carry literal "\n".
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const der = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i)
  return der
}

/** Client secret JWT for Apple's token endpoints (valid 5 minutes). */
export async function appleClientSecret(config: AppleConfig, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(config.privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: config.teamId,
      iat: nowSeconds,
      exp: nowSeconds + 300,
      aud: APPLE,
      sub: config.clientId,
    })
  )
  const signingInput = `${header}.${payload}`
  // WebCrypto returns the raw r||s (IEEE P1363) form, which is what JWS ES256 uses.
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput))
  )
  return `${signingInput}.${base64url(sig)}`
}

export type RevokeResult = 'revoked' | 'exchange_failed' | 'revoke_failed'

export async function revokeAppleAuthorizationCode(
  config: AppleConfig,
  code: string,
  fetchFn: typeof fetch = fetch
): Promise<RevokeResult> {
  const clientSecret = await appleClientSecret(config)
  const form = (fields: Record<string, string>) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })

  const tokenRes = await fetchFn(
    `${APPLE}/auth/token`,
    form({ client_id: config.clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' })
  )
  if (!tokenRes.ok) return 'exchange_failed'
  const tokens = (await tokenRes.json().catch(() => null)) as { refresh_token?: string; access_token?: string } | null
  const token = tokens?.refresh_token ?? tokens?.access_token
  if (!token) return 'exchange_failed'

  const revokeRes = await fetchFn(
    `${APPLE}/auth/revoke`,
    form({
      client_id: config.clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: tokens?.refresh_token ? 'refresh_token' : 'access_token',
    })
  )
  return revokeRes.ok ? 'revoked' : 'revoke_failed'
}
