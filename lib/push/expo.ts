// Expo Push API delivery for native-app devices, used by the PWA's
// /api/ahoys/send route so PWA senders reach native receivers during the
// transition. Mirrors supabase/functions/_shared/push.ts (Deno).

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_BATCH = 100

export interface AhoyPush {
  phrase: string
  senderId: string
  senderUsername: string
}

export interface ExpoResult {
  sent: number
  /** Tokens Expo reported as DeviceNotRegistered — safe to delete. */
  deadTokens: string[]
  errors: string[]
}

interface ExpoTicket {
  status: 'ok' | 'error'
  message?: string
  details?: { error?: string }
}

export async function sendExpoPushes(tokens: string[], push: AhoyPush): Promise<ExpoResult> {
  const result: ExpoResult = { sent: 0, deadTokens: [], errors: [] }
  if (tokens.length === 0) return result

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`

  for (let i = 0; i < tokens.length; i += EXPO_BATCH) {
    const batch = tokens.slice(i, i + EXPO_BATCH)
    const messages = batch.map((to) => ({
      to,
      title: push.phrase,
      body: `@${push.senderUsername}`,
      sound: 'ahoy.wav',
      categoryId: 'ahoy',
      channelId: 'ahoy-v1',
      priority: 'high',
      data: { senderId: push.senderId, senderUsername: push.senderUsername },
    }))

    try {
      const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) })
      const payload = (await res.json().catch(() => null)) as { data?: ExpoTicket[]; errors?: unknown } | null
      if (!res.ok || !payload?.data) {
        result.errors.push(`expo http ${res.status}: ${JSON.stringify(payload?.errors ?? payload)}`)
        continue
      }
      payload.data.forEach((ticket, idx) => {
        if (ticket.status === 'ok') result.sent++
        else if (ticket.details?.error === 'DeviceNotRegistered') result.deadTokens.push(batch[idx])
        else result.errors.push(`${ticket.details?.error ?? 'error'}: ${ticket.message ?? ''}`)
      })
    } catch (err) {
      result.errors.push(`expo fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return result
}
