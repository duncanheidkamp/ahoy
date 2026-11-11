import { describe, expect, it } from '@jest/globals'

import { REPORT_ALSO_BLOCK_DEFAULT, REPORT_NOTE_MAX, reportErrorMessage, validateReportNote } from '@/lib/reports'

describe('validateReportNote (mirrors public.reports.note)', () => {
  it('note is optional; blank -> null', () => {
    expect(validateReportNote('')).toEqual({ valid: true, note: null })
    expect(validateReportNote('   \n ')).toEqual({ valid: true, note: null })
  })

  it('trims', () => {
    expect(validateReportNote('  rude username  ')).toEqual({ valid: true, note: 'rude username' })
  })

  it('500 characters is the limit (after trimming)', () => {
    expect(validateReportNote('x'.repeat(REPORT_NOTE_MAX)).valid).toBe(true)
    expect(validateReportNote(` ${'x'.repeat(REPORT_NOTE_MAX)} `).valid).toBe(true)
    const tooLong = validateReportNote('x'.repeat(REPORT_NOTE_MAX + 1))
    expect(tooLong.valid).toBe(false)
    if (!tooLong.valid) expect(tooLong.error).toContain('501')
  })
})

describe('reportErrorMessage', () => {
  it('explains the daily limit', () => {
    expect(reportErrorMessage({ message: 'rate_limited', code: 'P0001' })).toMatch(/tomorrow/)
  })
  it('generic otherwise', () => {
    expect(reportErrorMessage({ message: 'new row violates row-level security policy' })).toMatch(/try again/)
    expect(reportErrorMessage(null)).toMatch(/try again/)
  })
})

describe('report screen defaults', () => {
  it('"Also block" is on by default', () => {
    expect(REPORT_ALSO_BLOCK_DEFAULT).toBe(true)
  })
})
