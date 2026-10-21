import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, detailCard, emailFootnote, emailHeading, escHtml } from './base'

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
  const { entityName, action, ctaUrl, ctaLabel = 'View', kind } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)

  const subject =
    kind === 'created'
      ? `${brandCap}: A reminder has been created`
      : `${brandCap}: Follow up today — ${action}`

  const headline =
    kind === 'created'
      ? 'A reminder has been created'
      : 'Follow up today'

  const body = [
    emailHeading(headline),
    detailCard({ label: 'Topic', title: action, lines: entityName ? [entityName] : [] }),
    ctaUrl ? ctaButton(ctaLabel, ctaUrl) : '',
    emailFootnote(`This reminder was set in your ${escHtml(brandCap)} workspace. You can manage your reminders from the reminders panel.`),
  ].join('\n')

  return { subject, html: renderEmail({ title: subject, preheader: `${action} — ${entityName}`, body }) }
}
