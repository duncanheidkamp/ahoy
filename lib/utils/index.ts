import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`

  return then.toLocaleDateString()
}

export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username) {
    return { valid: false, error: 'Username is required' }
  }

  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' }
  }

  if (username.length > 20) {
    return { valid: false, error: 'Username must be at most 20 characters' }
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain lowercase letters, numbers, and underscores' }
  }

  return { valid: true }
}

export interface BadgeInfo {
  label: string
  icon: string
  color: string
}

export function getBadge(count: number): BadgeInfo | null {
  if (count >= 10000) {
    return { label: 'Admiral', icon: '⚓', color: 'bg-yellow-500' }
  }
  if (count >= 1000) {
    return { label: 'Captain', icon: '🛞', color: 'bg-amber-600' }
  }
  if (count >= 500) {
    return { label: 'First Mate', icon: '🧭', color: 'bg-sky-600' }
  }
  if (count >= 100) {
    return { label: 'Sailor', icon: '⚓', color: 'bg-teal-600' }
  }
  return null
}
