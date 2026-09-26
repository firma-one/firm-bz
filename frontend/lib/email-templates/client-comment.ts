import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, escHtml, TEXT_DARK, TEXT_MUTED } from './base'

interface ClientCommentEmailParams {
  commenterName: string
  engagementName: string
  commentPreview: string
  ctaUrl?: string | null
}

export function renderClientCommentEmail(params: ClientCommentEmailParams): { subject: string; html: string } {
  const { commenterName, engagementName, commentPreview, ctaUrl } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)

  const subject = `${brandCap}: New comment from ${commenterName} — ${engagementName}`

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.01em;">New comment from your client</h2>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">From</p>
          <p style="margin:0 0 10px;font-size:15px;font-weight:600;color:${TEXT_DARK};">${escHtml(commenterName)} — ${escHtml(engagementName)}</p>
          <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.6;">${escHtml(commentPreview)}</p>
        </td>
      </tr>
    </table>

    ${ctaUrl ? ctaButton('View comment →', ctaUrl) : ''}

    <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
      You can turn this email off in Firm Settings → Event Notifications.
    </p>
  `

  return { subject, html: renderEmail({ title: subject, preheader: `${commenterName}: ${commentPreview}`, body }) }
}
