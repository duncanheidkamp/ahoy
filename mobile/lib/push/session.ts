// Before sending from a notification action the app may have been asleep for
// hours: auto-refresh only runs in the foreground (lib/supabase.ts), so the
// stored access token is often expired. Refresh it explicitly first.

export const REFRESH_MARGIN_MS = 60_000

interface SessionLike {
  expires_at?: number // seconds since epoch
}

export interface AuthLike {
  getSession(): Promise<{ data: { session: SessionLike | null }; error: unknown }>
  refreshSession(): Promise<{ data: { session: SessionLike | null }; error: unknown }>
}

export type FreshSession = 'ok' | 'signed_out' | 'refresh_failed'

export async function ensureFreshSession(auth: AuthLike, now: () => number = Date.now): Promise<FreshSession> {
  const { data } = await auth.getSession()
  const session = data.session
  if (!session) return 'signed_out'
  const expiresAtMs = (session.expires_at ?? 0) * 1000
  if (expiresAtMs - now() > REFRESH_MARGIN_MS) return 'ok'
  const refreshed = await auth.refreshSession()
  if (refreshed.error || !refreshed.data.session) return 'refresh_failed'
  return 'ok'
}
