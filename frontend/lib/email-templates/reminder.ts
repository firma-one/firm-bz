import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, escHtml, TEXT_DARK, TEXT_MUTED, PRIMARY } from './base'

interface ReminderEmailParams {
  /** Short description of the entity the reminder is about, e.g. "deepaksshettigar@gmail.com" */
  entityName: string
  /** Action label, e.g. "Invitation expiring" or "Review comment" */
  action: string
  /** Full URL to the relevant page (already includes app base URL) */
  ctaUrl?: string | null
  /** CTA button label, e.g. "View →" or "Open →" */
  ctaLabel?: string
  /** Whether this is the initial creation email or a scheduled follow-up */
  kind: 'created' | 'followup' | 'recurring'
}

export function renderReminderEmail(params: ReminderEmailParams): { subject: string; html: string } {
  const { entityName, action, ctaUrl, ctaLabel = 'View →', kind } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)

  const subject =
    kind === 'created'
      ? `${brandCap}: A reminder has been created`
      : `${brandCap}: Follow up today — ${action}`

  const headline =
    kind === 'created'
      ? 'A reminder has been created'
      : 'Follow up today'

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.01em;">${escHtml(headline)}</h2>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">Topic</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:${TEXT_DARK};">${escHtml(action)}</p>
          ${entityName ? `<p style="margin:6px 0 0;font-size:13px;color:${TEXT_MUTED};">${escHtml(entityName)}</p>` : ''}
        </td>
      </tr>
    </table>

    ${ctaUrl ? ctaButton(ctaLabel, ctaUrl) : ''}

    <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
      This reminder was set in your ${escHtml(brandCap)} workspace. You can manage your reminders from the reminders panel.
    </p>
  `

  return { subject, html: renderEmail({ title: subject, preheader: `${action} — ${entityName}`, body }) }
}
