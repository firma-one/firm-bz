import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, escHtml, TEXT_DARK, TEXT_MUTED } from './base'

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
    ? `${escHtml(engagementName)} · ${escHtml(clientName)} · ${escHtml(firmName)}`
    : engagementName
      ? `${escHtml(engagementName)} · ${escHtml(firmName)}`
      : escHtml(firmName)

  const contextName = engagementName ?? clientName ?? firmName
  const subject = `You've been added to ${contextName} on ${brandCap}`

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.01em;">You've been added</h2>
    <p style="margin:0 0 20px;font-size:15px;color:${TEXT_MUTED};line-height:1.6;">
      You've been granted access to a workspace on ${escHtml(brandCap)}. It's already available in your dashboard — head over whenever you're ready.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:4px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">Workspace</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:${TEXT_DARK};">${contextLine}</p>
        </td>
      </tr>
    </table>

    ${ctaButton('Go to Engagement →', engagementUrl)}
  `

  return { subject, html: renderEmail({ title: subject, preheader: `You've been added to ${contextName}`, body }) }
}
