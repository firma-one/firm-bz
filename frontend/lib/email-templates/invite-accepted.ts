import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, detailCard, emailFootnote, emailHeading } from './base'

interface InviteAcceptedEmailParams {
  memberName: string
  engagementName: string
  ctaUrl?: string | null
}

export function renderInviteAcceptedEmail(params: InviteAcceptedEmailParams): { subject: string; html: string } {
  const { memberName, engagementName, ctaUrl } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)

  const subject = `${brandCap}: ${memberName} joined ${engagementName}`

  const body = [
    emailHeading('A new member joined your engagement'),
    detailCard({ label: 'Member', title: memberName, lines: [engagementName] }),
    ctaUrl ? ctaButton('View engagement', ctaUrl) : '',
    emailFootnote('You can turn this email off in Firm Settings → Event Notifications.'),
  ].join('\n')

  return { subject, html: renderEmail({ title: subject, preheader: `${memberName} accepted their invite to ${engagementName}`, body }) }
}
