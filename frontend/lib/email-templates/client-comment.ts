import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, detailCard, emailFootnote, emailHeading } from './base'

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

  const body = [
    emailHeading('New comment from your client'),
    detailCard({ label: 'From', title: `${commenterName} — ${engagementName}`, lines: [commentPreview] }),
    ctaUrl ? ctaButton('View comment', ctaUrl) : '',
    emailFootnote('You can turn this email off in Firm Settings → Event Notifications.'),
  ].join('\n')

  return { subject, html: renderEmail({ title: subject, preheader: `${commenterName}: ${commentPreview}`, body }) }
}
