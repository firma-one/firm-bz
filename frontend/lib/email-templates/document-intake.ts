import { BRAND_NAME } from '@/config/brand'
import { renderEmail, ctaButton, detailCard, emailFootnote, emailHeading } from './base'

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

  const body = [
    emailHeading('A new document is awaiting review'),
    detailCard({ label: 'File', title: fileName, lines: [engagementName] }),
    ctaUrl ? ctaButton('Review intake', ctaUrl) : '',
    emailFootnote("A client uploaded this file for your engagement and it needs approval before it's indexed and shared. You can turn this email off in Firm Settings → Event Notifications."),
  ].join('\n')

  return { subject, html: renderEmail({ title: subject, preheader: `${fileName} — ${engagementName}`, body }) }
}
