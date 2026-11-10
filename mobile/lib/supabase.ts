import 'react-native-url-polyfill/auto'

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState, Platform } from 'react-native'

import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './env'
import { createChunkedStorage } from './secure-storage'
import type { Database } from './types'

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  // Readable after the first unlock since boot, including while locked —
  // required for the background "Ahoy back" notification action (Phase 3).
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
}

const authStorage = createChunkedStorage({
  getItemAsync: (key) => SecureStore.getItemAsync(key, secureStoreOptions),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, secureStoreOptions),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, secureStoreOptions),
})

// createClient throws on an empty URL; the root layout shows a config error
// screen instead when isConfigured is false, so a placeholder is safe here.
export const supabase = createClient<Database>(
  isConfigured ? SUPABASE_URL : 'http://not-configured.invalid',
  isConfigured ? SUPABASE_ANON_KEY : 'not-configured',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)

// Only refresh tokens while the app is in the foreground. In the background
// the timer would be suspended anyway and fire in a burst on resume.
if (Platform.OS !== 'web') {
  const sync = (state: string) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  }
  sync(AppState.currentState ?? 'active')
  AppState.addEventListener('change', sync)
}
