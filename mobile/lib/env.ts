// EXPO_PUBLIC_* variables are inlined into the JS bundle at build time by
// Metro (from mobile/.env locally, or from EAS environment variables in cloud
// builds). They are public by design: the anon key is safe to ship; RLS and the
// security-definer RPCs are what protect the data.

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const isConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0

// TODO(phase-4): replace with the real universal-link domain.
export const INVITE_BASE_URL = 'https://ahoy.example/add/'
