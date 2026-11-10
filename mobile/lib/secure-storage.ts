// Supabase auth storage backed by the iOS Keychain / Android Keystore via
// expo-secure-store.
//
// SecureStore warns about (and on some platforms rejects) values over 2048
// bytes, and a Supabase session (access + refresh token + user JSON) is usually
// bigger than that. So values are split into chunks of <= MAX_CHUNK_BYTES:
//
//   <key>          -> the value itself if small, else "__ahoy_chunked__:<n>"
//   <key>.<i>      -> chunk i of n (only when chunked)
//
// keychainAccessible is AFTER_FIRST_UNLOCK so the session can be read while
// the phone is locked — needed later for the background "Ahoy back" action.

export const MAX_CHUNK_BYTES = 2000
const CHUNK_MARKER = '__ahoy_chunked__:'

export interface KeyValueBackend {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1
  if (codePoint < 0x800) return 2
  if (codePoint < 0x10000) return 3
  return 4
}

/** Splits on code-point boundaries so each chunk is <= maxBytes of UTF-8. */
export function splitIntoChunks(value: string, maxBytes = MAX_CHUNK_BYTES): string[] {
  const chunks: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of value) {
    const len = utf8Length(ch.codePointAt(0)!)
    if (bytes + len > maxBytes) {
      chunks.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += len
  }
  if (current || chunks.length === 0) chunks.push(current)
  return chunks
}

function byteLength(value: string): number {
  let n = 0
  for (const ch of value) n += utf8Length(ch.codePointAt(0)!)
  return n
}

const chunkKey = (key: string, i: number) => `${key}.${i}`

function parseChunkCount(head: string | null): number | null {
  if (!head || !head.startsWith(CHUNK_MARKER)) return null
  const n = Number(head.slice(CHUNK_MARKER.length))
  return Number.isInteger(n) && n > 0 ? n : null
}

export function createChunkedStorage(backend: KeyValueBackend, maxBytes = MAX_CHUNK_BYTES) {
  async function removeChunks(key: string, count: number) {
    await Promise.all(Array.from({ length: count }, (_, i) => backend.deleteItemAsync(chunkKey(key, i))))
  }

  return {
    async getItem(key: string): Promise<string | null> {
      const head = await backend.getItemAsync(key)
      const count = parseChunkCount(head)
      if (count === null) return head
      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) => backend.getItemAsync(chunkKey(key, i)))
      )
      // A missing chunk means a partial write; treat the session as absent.
      if (parts.some((p) => p === null)) return null
      return parts.join('')
    },

    async setItem(key: string, value: string): Promise<void> {
      const previous = parseChunkCount(await backend.getItemAsync(key))
      if (byteLength(value) <= maxBytes && !value.startsWith(CHUNK_MARKER)) {
        await backend.setItemAsync(key, value)
        if (previous) await removeChunks(key, previous)
        return
      }
      const chunks = splitIntoChunks(value, maxBytes)
      // Write chunks first, then the head, so a crash mid-write never leaves a
      // head pointing at chunks from a different value of a different length.
      await Promise.all(chunks.map((c, i) => backend.setItemAsync(chunkKey(key, i), c)))
      await backend.setItemAsync(key, `${CHUNK_MARKER}${chunks.length}`)
      if (previous && previous > chunks.length) {
        await Promise.all(
          Array.from({ length: previous - chunks.length }, (_, j) =>
            backend.deleteItemAsync(chunkKey(key, chunks.length + j))
          )
        )
      }
    },

    async removeItem(key: string): Promise<void> {
      const count = parseChunkCount(await backend.getItemAsync(key))
      if (count) await removeChunks(key, count)
      await backend.deleteItemAsync(key)
    },
  }
}
