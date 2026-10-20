import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, detailCard, emailFootnote, emailHeading, emailText, escHtml } from './base'

interface InviteEmailParams {
  firmName: string
  engagementName?: string | null
  clientName?: string | null
  inviteUrl: string
}

export function renderInviteEmail(params: InviteEmailParams): { subject: string; html: string } {
  const { firmName, engagementName, clientName, inviteUrl } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)

  const contextLine = engagementName && clientName
    ? `${engagementName} · ${clientName} · ${firmName}`
    : engagementName
      ? `${engagementName} · ${firmName}`
      : firmName

  const contextName = engagementName ?? clientName ?? firmName
  const subject = `Action required: You've been invited to ${contextName} on ${brandCap}`

  const body = [
    emailHeading("You've been invited"),
    emailText(`You've been granted access to a workspace on ${escHtml(brandCap)}. Accept the invitation below to get started.`),
    detailCard({ label: 'Workspace', title: contextLine }),
    ctaButton('Accept invitation', inviteUrl),
    emailFootnote("This invitation expires in 7 days. If you weren't expecting this, you can safely ignore it."),
  ].join('\n')

  return { subject, html: renderEmail({ title: subject, preheader: `You've been invited to ${contextName}`, body }) }
}
