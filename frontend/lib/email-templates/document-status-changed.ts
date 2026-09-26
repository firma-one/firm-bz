import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, escHtml, TEXT_DARK, TEXT_MUTED } from './base'

const STATUS_LABELS: Record<string, string> = {
  to_do: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  approved: 'Approved',
}

interface DocumentStatusChangedEmailParams {
  fileName: string
  engagementName: string
  oldStatus: string | null
  newStatus: string
  /** True when this transition represents a rejection / changes-requested move */
  isRejection: boolean
  ctaUrl?: string | null
}

export function renderDocumentStatusChangedEmail(params: DocumentStatusChangedEmailParams): { subject: string; html: string } {
  const { fileName, engagementName, oldStatus, newStatus, isRejection, ctaUrl } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)
  const newStatusLabel = STATUS_LABELS[newStatus] ?? newStatus
  const oldStatusLabel = oldStatus ? (STATUS_LABELS[oldStatus] ?? oldStatus) : null

  const subject = isRejection
    ? `${brandCap}: Changes requested — ${fileName}`
    : `${brandCap}: Status changed to ${newStatusLabel} — ${fileName}`

  const headline = isRejection ? 'Changes were requested' : 'Document status changed'

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.01em;">${escHtml(headline)}</h2>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">File</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:${TEXT_DARK};">${escHtml(fileName)}</p>
          <p style="margin:6px 0 0;font-size:13px;color:${TEXT_MUTED};">${escHtml(engagementName)}</p>
          <p style="margin:10px 0 0;font-size:13px;color:${TEXT_MUTED};">${oldStatusLabel ? `${escHtml(oldStatusLabel)} → ` : ''}<strong style="color:${TEXT_DARK};">${escHtml(newStatusLabel)}</strong></p>
        </td>
      </tr>
    </table>

    ${ctaUrl ? ctaButton('View document →', ctaUrl) : ''}

    <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
      You can turn this email off in Firm Settings → Event Notifications.
    </p>
  `

  return { subject, html: renderEmail({ title: subject, preheader: `${fileName} — ${newStatusLabel}`, body }) }
}
