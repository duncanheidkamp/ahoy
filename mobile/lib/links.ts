// Invite links: https://<LINKS_DOMAIN>/add/<username> (universal link / App
// Link) and ahoy://add/<username> (custom scheme). Both land on the
// app/add/[username] route. If the user isn't ready (signed out, or no
// username yet) the link is remembered and resumed afterwards.

import type { JsonStore } from './kv'
import { normalizeUsername, validateUsername } from './username'

export function inviteUrl(username: string, domain: string): string {
  return `https://${domain}/add/${encodeURIComponent(username)}`
}

export function inviteMessage(username: string, domain: string): string {
  return `Join my crew on Ahoy! ${inviteUrl(username, domain)}`
}

/** A route param / path segment -> a valid username, or null. */
export function parseInviteUsername(raw: string | string[] | undefined | null): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }
  const name = normalizeUsername(decoded.replace(/^@/, ''))
  return validateUsername(name).valid ? name : null
}

/**
 * Full URL -> username, for https://<domain>/add/<name>[/] and
 * ahoy://add/<name>. Anything else (other hosts, paths) -> null.
 */
export function parseInviteUrl(url: string, domain: string): string | null {
  const scheme = /^ahoy:\/\/add\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(url)
  if (scheme) return parseInviteUsername(scheme[1])
  const https = /^https:\/\/([^/?#]+)\/add\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(url)
  if (https && https[1].toLowerCase() === domain.toLowerCase()) return parseInviteUsername(https[2])
  return null
}

export const PENDING_LINK_KEY = 'ahoy.links.pendingInvite'
/** An invite opened while signed out is resumed if the user gets in within this time. */
export const PENDING_LINK_TTL_MS = 24 * 60 * 60 * 1000

interface PendingInvite {
  username: string
  savedAt: number
}

export function createPendingInvites(store: JsonStore, now: () => number = Date.now) {
  return {
    async save(username: string): Promise<void> {
      const name = parseInviteUsername(username)
      if (!name) return
      await store.set(PENDING_LINK_KEY, { username: name, savedAt: now() } satisfies PendingInvite)
    },
    /** Returns the pending invite (once) and clears it. Expired ones are dropped. */
    async take(): Promise<string | null> {
      const pending = await store.get<PendingInvite>(PENDING_LINK_KEY)
      if (!pending) return null
      await store.remove(PENDING_LINK_KEY).catch(() => {})
      if (typeof pending.savedAt !== 'number' || now() - pending.savedAt > PENDING_LINK_TTL_MS) return null
      return parseInviteUsername(pending.username)
    },
    clear: () => store.remove(PENDING_LINK_KEY),
  }
}

export type PendingInvites = ReturnType<typeof createPendingInvites>
