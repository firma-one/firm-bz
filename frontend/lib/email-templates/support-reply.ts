import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, detailCard, emailFootnote, emailHeading } from './base'

interface SupportReplyEmailParams {
  ticketNumber: string
  /** The request's title: the first line of what was written. */
  title: string
  replyPreview: string
  ctaUrl?: string | null
}

/** To whoever raised a support request, when the Firma team replies to it. */
export function renderSupportReplyEmail(params: SupportReplyEmailParams): { subject: string; html: string } {
  const { ticketNumber, title, replyPreview, ctaUrl } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)

  const subject = `${brandCap} replied to your request ${ticketNumber}`

  const body = [
    emailHeading(`${brandCap} replied to your request`),
    detailCard({ label: ticketNumber, title, lines: [replyPreview] }),
    ctaUrl ? ctaButton('Open the request', ctaUrl) : '',
    emailFootnote('Reply from the request in the app, so the whole conversation stays in one place.'),
  ].join('\n')

  return { subject, html: renderEmail({ title: subject, preheader: replyPreview, body }) }
}
