// Same rules as the server (users.username check constraints and
// username_available()): lowercase, 3–20 chars, a-z 0-9 _.

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
const USERNAME_RE = /^[a-z0-9_]+$/

export type UsernameValidation = { valid: true } | { valid: false; error: string }

/** Lowercases and trims what the user typed so the field matches the server rule. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase()
}

export function validateUsername(username: string): UsernameValidation {
  if (!username) return { valid: false, error: 'Username is required' }
  if (username.length < USERNAME_MIN) {
    return { valid: false, error: `Username must be at least ${USERNAME_MIN} characters` }
  }
  if (username.length > USERNAME_MAX) {
    return { valid: false, error: `Username must be at most ${USERNAME_MAX} characters` }
  }
  if (!USERNAME_RE.test(username)) {
    return { valid: false, error: 'Only lowercase letters, numbers, and underscores' }
  }
  return { valid: true }
}
