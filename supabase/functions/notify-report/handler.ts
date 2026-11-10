// Request handling for notify-report, with its I/O injected so it can be
// unit-tested (supabase/functions/_tests/notify_report_test.ts).

import { corsHeaders, json } from '../_shared/http.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ClaimedReport {
  report_id: string
  reporter_username: string | null
  reported_id: string | null
  reported_username: string | null
  note: string | null
  created_at: string
}

export interface ReportEmail {
  subject: string
  text: string
}

export interface NotifyReportDeps {
  authenticate(req: Request): Promise<{ id: string } | null>
  /** public.claim_report_notification(caller, report) via the service role; null if nothing to claim. */
  claim(callerId: string, reportId: string): Promise<ClaimedReport | null>
  /** null when Resend isn't configured (RESEND_API_KEY / REPORT_EMAIL_TO / REPORT_EMAIL_FROM). */
  sendEmail: ((email: ReportEmail) => Promise<void>) | null
  log(message: string, details?: unknown): void
}

export function reportEmail(report: ClaimedReport, reporterId: string): ReportEmail {
  const reported = report.reported_username ? `@${report.reported_username}` : '(deleted account)'
  const reporter = report.reporter_username ? `@${report.reporter_username}` : '(no username)'
  return {
    subject: `Ahoy report: ${reported} reported by ${reporter}`,
    text: [
      `Reported: ${reported} (${report.reported_id ?? 'n/a'})`,
      `Reporter: ${reporter} (${reporterId})`,
      `When: ${report.created_at}`,
      `Report id: ${report.report_id}`,
      '',
      'Note:',
      report.note ?? '(none)',
      '',
      'Review within 24 hours (App Store guideline 1.2). Act in the Supabase dashboard:',
      'public.reports, public.users; delete the account via Authentication > Users if needed.',
    ].join('\n'),
  }
}

export async function handleNotifyReport(req: Request, deps: NotifyReportDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const user = await deps.authenticate(req)
  if (!user) return json({ error: 'unauthorized' }, 401)

  let reportId: unknown
  try {
    reportId = (await req.json())?.report_id
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (typeof reportId !== 'string' || !UUID_RE.test(reportId)) {
    return json({ error: 'report_id required' }, 400)
  }

  let report: ClaimedReport | null
  try {
    report = await deps.claim(user.id, reportId)
  } catch (err) {
    deps.log('claim_report_notification failed', err)
    return json({ error: 'notify_failed' }, 500)
  }
  // Unknown, someone else's, or already notified: a harmless no-op.
  if (!report) return json({ ok: true, notified: false })

  const email = reportEmail(report, user.id)
  if (!deps.sendEmail) {
    deps.log(`[report] email not configured; ${email.subject}`, email.text)
    return json({ ok: true, notified: false, logged: true })
  }
  try {
    await deps.sendEmail(email)
  } catch (err) {
    // The report itself is saved and claimed; it's still in public.reports.
    deps.log(`[report] email failed; ${email.subject}`, { err: String(err), text: email.text })
    return json({ ok: true, notified: false, logged: true })
  }
  return json({ ok: true, notified: true })
}

/** Resend sender, or null when any of its secrets is missing. */
export function resendSender(
  env: (name: string) => string | undefined,
  fetchFn: typeof fetch = fetch
): ((email: ReportEmail) => Promise<void>) | null {
  const apiKey = env('RESEND_API_KEY')
  const to = env('REPORT_EMAIL_TO')
  const from = env('REPORT_EMAIL_FROM')
  if (!apiKey || !to || !from) return null
  const recipients = to.split(',').map((s) => s.trim()).filter(Boolean)
  if (recipients.length === 0) return null
  return async (email) => {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipients, subject: email.subject, text: email.text }),
    })
    if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text().catch(() => '')}`)
  }
}
