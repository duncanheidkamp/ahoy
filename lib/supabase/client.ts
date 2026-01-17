import { createBrowserClient } from '@supabase/ssr'
import { Database } from './types'

export function createClient() {
  // Use placeholder values during build time to allow static analysis
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

  return createBrowserClient<Database>(supabaseUrl, supabaseKey)
}
