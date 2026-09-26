import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, escHtml, TEXT_DARK, TEXT_MUTED } from './base'

interface DocumentIntakeEmailParams {
  /** Name of the uploaded file */
  fileName: string
  /** Name of the engagement the file was uploaded to */
  engagementName: string
  /** Full URL to the intake queue (already includes app base URL) */
  ctaUrl?: string | null
}

export function renderDocumentIntakeEmail(params: DocumentIntakeEmailParams): { subject: string; html: string } {
  const { fileName, engagementName, ctaUrl } = params
  const brandCap = BRAND_NAME.charAt(0).toUpperCase() + BRAND_NAME.slice(1)

  const subject = `${brandCap}: New file awaiting review — ${fileName}`

  const body = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.01em;">A new document is awaiting review</h2>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9fb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:${TEXT_MUTED};">File</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:${TEXT_DARK};">${escHtml(fileName)}</p>
          <p style="margin:6px 0 0;font-size:13px;color:${TEXT_MUTED};">${escHtml(engagementName)}</p>
        </td>
      </tr>
    </table>

    ${ctaUrl ? ctaButton('Review intake →', ctaUrl) : ''}

    <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
      A client uploaded this file for your engagement and it needs approval before it's indexed and shared. You can turn this email off in Firm Settings → Event Notifications.
    </p>
  `

  return { subject, html: renderEmail({ title: subject, preheader: `${fileName} — ${engagementName}`, body }) }
}
