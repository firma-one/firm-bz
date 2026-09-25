import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, escHtml, TEXT_DARK, TEXT_MUTED } from './base'

interface InviteAcceptedEmailParams {
  memberName: string
  engagementName: string
  ctaUrl?: string | null
}

export function renderInviteAcceptedEmail(params: InviteAcceptedEmailParams): { subject: string; html: string } {
  const { memberName, engagementName, ctaUrl } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)

  const subject = `${brandCap}: ${memberName} joined ${engagementName}`

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.01em;">A new member joined your engagement</h2>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">Member</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:${TEXT_DARK};">${escHtml(memberName)}</p>
          <p style="margin:6px 0 0;font-size:13px;color:${TEXT_MUTED};">${escHtml(engagementName)}</p>
        </td>
      </tr>
    </table>

    ${ctaUrl ? ctaButton('View engagement →', ctaUrl) : ''}

    <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
      You can turn this email off in Firm Settings → Event Notifications.
    </p>
  `

  return { subject, html: renderEmail({ title: subject, preheader: `${memberName} accepted their invite to ${engagementName}`, body }) }
}
