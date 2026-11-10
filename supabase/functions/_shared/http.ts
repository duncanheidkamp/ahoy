import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing env var ${name}`)
  return value
}

/** Service-role client. Bypasses RLS — only use after authorising the caller. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Verifies the caller's JWT by asking Supabase Auth who it belongs to, using a
 * client built from the caller's own Authorization header. Returns null if the
 * token is missing, expired, or revoked.
 */
export async function authenticate(req: Request): Promise<User | null> {
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return null

  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await userClient.auth.getUser(authorization.slice('Bearer '.length))
  if (error || !data.user) return null
  return data.user
}
