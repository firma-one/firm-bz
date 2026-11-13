import { renderEmail, ctaButton, emailFootnote, emailHeading, emailText, escHtml } from './base'

interface StatusUpdateEmailParams {
    firmName: string
    engagementName: string
    /** The Lead who sent it. */
    senderName: string
    /** The update as the Lead edited it: plain text, paragraphs separated by blank lines. */
    text: string
    ctaUrl?: string | null
}

/**
 * A Lead's status update to the client side of an engagement. The body is the Lead's own text
 * (Brio drafted it; a person edited and sent it), so it is escaped and shown as written.
 */
export function renderStatusUpdateEmail(params: StatusUpdateEmailParams): { subject: string; html: string } {
    const { firmName, engagementName, senderName, text, ctaUrl } = params
    const subject = `Update from ${firmName} · ${engagementName}`
    const paragraphs = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => emailText(escHtml(p).replace(/\n/g, '<br>')))

    const body = [
        // emailHeading escapes its own text.
        emailHeading(`${engagementName}: an update`),
        ...paragraphs,
        emailText(`<span style="color:#3F5650;">${escHtml(senderName)} · ${escHtml(firmName)}</span>`),
        ctaUrl ? ctaButton('Open the engagement', ctaUrl) : '',
        emailFootnote('Reply in the engagement, so the whole conversation stays in one place.'),
    ].join('\n')

    const preheader = text.replace(/\s+/g, ' ').slice(0, 120)
    return { subject, html: renderEmail({ title: subject, preheader, body }) }
}
