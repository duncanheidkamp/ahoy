// Report validation (mirrors public.reports: note <= 500 chars, trimmed,
// empty -> null) and how the server's refusals read to the user.

export const REPORT_NOTE_MAX = 500

/** "Also block" starts switched on when reporting (Duncan, Phase 4 review). */
export const REPORT_ALSO_BLOCK_DEFAULT = true

export type ReportNoteValidation = { valid: true; note: string | null } | { valid: false; error: string }

export function validateReportNote(input: string): ReportNoteValidation {
  const note = input.trim()
  if (note.length > REPORT_NOTE_MAX) {
    return { valid: false, error: `Keep it under ${REPORT_NOTE_MAX} characters (${note.length} now)` }
  }
  return { valid: true, note: note.length ? note : null }
}

/** PostgREST error -> message. 'rate_limited' comes from reports_guard_insert. */
export function reportErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  if (error?.message?.includes('rate_limited')) return 'You’ve sent a lot of reports today. Try again tomorrow.'
  return 'Couldn’t send the report — try again'
}

export const FEEDBACK_MAX = 1000
