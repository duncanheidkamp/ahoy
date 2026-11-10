import { describe, expect, it } from '@jest/globals'
import { createChunkedStorage, MAX_CHUNK_BYTES, splitIntoChunks, type KeyValueBackend } from '@/lib/secure-storage'

function memoryBackend() {
  const map = new Map<string, string>()
  const backend: KeyValueBackend = {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => {
      if (new TextEncoder().encode(v).length > MAX_CHUNK_BYTES) throw new Error(`value too large for ${k}`)
      map.set(k, v)
    },
    deleteItemAsync: async (k) => {
      map.delete(k)
    },
  }
  return { map, backend }
}

const KEY = 'sb-abcdefgh-auth-token'

describe('chunked SecureStore adapter', () => {
  it('stores small values directly', async () => {
    const { map, backend } = memoryBackend()
    const s = createChunkedStorage(backend)
    await s.setItem(KEY, '{"a":1}')
    expect([...map.keys()]).toEqual([KEY])
    expect(await s.getItem(KEY)).toBe('{"a":1}')
  })

  it('round-trips a session larger than 2KB', async () => {
    const { map, backend } = memoryBackend()
    const s = createChunkedStorage(backend)
    const session = JSON.stringify({ access_token: 'x'.repeat(3000), refresh_token: 'y'.repeat(800), user: { e: 'é🏴‍☠️' } })
    await s.setItem(KEY, session)
    expect(map.size).toBeGreaterThan(2)
    expect(await s.getItem(KEY)).toBe(session)
  })

  it('cleans up old chunks when the value shrinks or is removed', async () => {
    const { map, backend } = memoryBackend()
    const s = createChunkedStorage(backend)
    await s.setItem(KEY, 'z'.repeat(7000))
    const big = map.size
    await s.setItem(KEY, 'z'.repeat(2500))
    expect(map.size).toBeLessThan(big)
    expect(await s.getItem(KEY)).toBe('z'.repeat(2500))
    await s.setItem(KEY, 'small')
    expect([...map.keys()]).toEqual([KEY])
    await s.setItem(KEY, 'q'.repeat(5000))
    await s.removeItem(KEY)
    expect(map.size).toBe(0)
    expect(await s.getItem(KEY)).toBeNull()
  })

  it('returns null if a chunk is missing (partial write)', async () => {
    const { map, backend } = memoryBackend()
    const s = createChunkedStorage(backend)
    await s.setItem(KEY, 'w'.repeat(5000))
    map.delete(`${KEY}.1`)
    expect(await s.getItem(KEY)).toBeNull()
  })

  it('splits on code points without exceeding the byte limit', () => {
    const value = '🏴‍☠️'.repeat(400) + 'ascii'.repeat(500)
    const chunks = splitIntoChunks(value, 2000)
    expect(chunks.join('')).toBe(value)
    for (const c of chunks) expect(new TextEncoder().encode(c).length).toBeLessThanOrEqual(2000)
  })
})
