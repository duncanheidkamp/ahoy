// Small JSON values (push bookkeeping, prompt timestamps) in SecureStore.
// AFTER_FIRST_UNLOCK so they are readable while the phone is locked — the
// "Ahoy back!" action runs from the lock screen. Not for anything large:
// SecureStore values should stay well under 2 KB.

import * as SecureStore from 'expo-secure-store'

const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }

export interface JsonStore {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export const kv: JsonStore = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await SecureStore.getItemAsync(key, options)
      return raw == null ? null : (JSON.parse(raw) as T)
    } catch {
      return null
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    await SecureStore.setItemAsync(key, JSON.stringify(value), options)
  },
  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key, options)
  },
}

/** In-memory JsonStore for tests. */
export function memoryStore(initial: Record<string, unknown> = {}): JsonStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...initial }
  return {
    data,
    get: <T,>(key: string) => Promise.resolve((key in data ? (data[key] as T) : null) as T | null),
    set: (key, value) => {
      data[key] = JSON.parse(JSON.stringify(value))
      return Promise.resolve()
    },
    remove: (key) => {
      delete data[key]
      return Promise.resolve()
    },
  }
}
