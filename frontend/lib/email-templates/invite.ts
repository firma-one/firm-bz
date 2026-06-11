import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, escHtml, TEXT_DARK, TEXT_MUTED, PRIMARY } from './base'

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
    ? `${escHtml(engagementName)} · ${escHtml(clientName)} · ${escHtml(firmName)}`
    : engagementName
      ? `${escHtml(engagementName)} · ${escHtml(firmName)}`
      : escHtml(firmName)

  const subject = `Action required: You've been invited to ${engagementName ?? firmName} on ${brandCap}`

  const body = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.01em;">You've been invited</h2>
    <p style="margin:0 0 20px;font-size:15px;color:${TEXT_MUTED};line-height:1.6;">
      You've been granted access to a workspace on ${escHtml(brandCap)}. Accept the invitation below to get started.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:4px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">Workspace</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:${TEXT_DARK};">${contextLine}</p>
        </td>
      </tr>
    </table>

    ${ctaButton('Accept Invitation →', inviteUrl)}

    <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
      This invitation expires in 7 days. If you weren't expecting this, you can safely ignore it.
    </p>
  `

  return { subject, html: renderEmail({ title: subject, preheader: `You've been invited to ${engagementName ?? firmName}`, body }) }
}
