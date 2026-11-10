// EXPO_PUBLIC_* variables are inlined into the JS bundle at build time by
// Metro (from mobile/.env locally, or from EAS environment variables in cloud
// builds). They are public by design: the anon key and OAuth client IDs are
// safe to ship; RLS and the security-definer RPCs are what protect the data.

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const isConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0

/**
 * The invite-links domain (links/ static site). One value, used for invite
 * URLs here and for associatedDomains / intentFilters in app.config.ts —
 * which reads the same variable, so a native rebuild is needed to change it.
 */
export const DEFAULT_LINKS_DOMAIN = 'ahoy.example'
export const LINKS_DOMAIN = (process.env.EXPO_PUBLIC_LINKS_DOMAIN ?? '').trim() || DEFAULT_LINKS_DOMAIN

/** Google OAuth client IDs (Google Cloud console). See README "Social login". */
export const GOOGLE_CLIENT_IDS = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
}
