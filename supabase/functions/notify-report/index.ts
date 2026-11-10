// POST /functions/v1/notify-report   Authorization: Bearer <user access token>
// Body: { "report_id": "<uuid>" }
//
// Called by the native app right after it inserts a row into public.reports.
// claim_report_notification() only hands back a report the caller filed and
// that hasn't been notified yet, then marks it. If RESEND_API_KEY,
// REPORT_EMAIL_TO and REPORT_EMAIL_FROM are all set, the report is emailed via
// Resend; otherwise it is only logged (Edge Function logs). Nothing about the
// recipient is hardcoded.

import { adminClient, authenticate } from '../_shared/http.ts'
import { handleNotifyReport, resendSender, type ClaimedReport } from './handler.ts'

Deno.serve((req) => {
  const admin = adminClient()
  return handleNotifyReport(req, {
    authenticate,
    async claim(callerId, reportId) {
      const { data, error } = await admin.rpc('claim_report_notification', {
        p_caller: callerId,
        p_report_id: reportId,
      })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as ClaimedReport | undefined
      return row ?? null
    },
    sendEmail: resendSender((name) => Deno.env.get(name)),
    log: (message, details) => console.log(message, details ?? ''),
  })
})
