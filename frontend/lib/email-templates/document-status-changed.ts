import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, detailCard, emailFootnote, emailHeading, escHtml } from './base'

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

  const statusLine = `<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#3F5650;">${oldStatusLabel ? `${escHtml(oldStatusLabel)} → ` : ''}<strong style="color:#05271C;">${escHtml(newStatusLabel)}</strong></p>`
  const body = [
    emailHeading(headline),
    detailCard({ label: 'File', title: fileName, lines: [engagementName], extraHtml: statusLine }),
    ctaUrl ? ctaButton('View document', ctaUrl) : '',
    emailFootnote('You can turn this email off in Firm Settings → Event Notifications.'),
  ].join('\n')

  return { subject, html: renderEmail({ title: subject, preheader: `${fileName} — ${newStatusLabel}`, body }) }
}
