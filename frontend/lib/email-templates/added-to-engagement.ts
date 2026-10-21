import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, detailCard, emailHeading, emailText, escHtml } from './base'

interface AddedToEngagementEmailParams {
  firmName: string
  engagementName?: string | null
  clientName?: string | null
  engagementUrl: string
}

export function renderAddedToEngagementEmail(params: AddedToEngagementEmailParams): { subject: string; html: string } {
  const { firmName, engagementName, clientName, engagementUrl } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)

  const contextLine = engagementName && clientName
    ? `${engagementName} · ${clientName} · ${firmName}`
    : engagementName
      ? `${engagementName} · ${firmName}`
      : firmName

  const contextName = engagementName ?? clientName ?? firmName
  const subject = `You've been added to ${contextName} on ${brandCap}`

  const body = [
    emailHeading("You've been added"),
    emailText(`You've been granted access to a workspace on ${escHtml(brandCap)}. It's already available in your dashboard — head over whenever you're ready.`),
    detailCard({ label: 'Workspace', title: contextLine }),
    ctaButton('Go to engagement', engagementUrl),
  ].join('\n')

  return { subject, html: renderEmail({ title: subject, preheader: `You've been added to ${contextName}`, body }) }
}
