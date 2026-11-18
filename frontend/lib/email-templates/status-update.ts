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

interface EngagementUpdateEmailParams {
    firmName: string
    engagementName: string
    /** The Lead who sent it. */
    senderName: string
    /** The published update: Markdown, `## Heading` sections (lib/ai/summary-sections.ts). */
    summary: string
    /** "Written by Brio · reviewed and published by Ana · Nov 17, 2026", as the Overview says it. */
    byline: string
    /** The sender's own words above the update. */
    note?: string | null
    /** Into the engagement, for its members. People emailed by address get none: it wouldn't open. */
    ctaUrl?: string | null
    /** The sender's copy: who it went to, said at the top. */
    copyOf?: string[]
}

const SECTION_LABEL = 'margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6B7A75;'

/** One block of a section's prose: escaped, `**bold**` kept, a run of "- " lines as a list. */
function proseBlock(block: string): string {
    const inline = (s: string) => escHtml(s).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length > 0 && lines.every((l) => /^[-*•]\s+/.test(l))) {
        const items = lines.map((l) => `<li style="margin:0 0 6px;">${inline(l.replace(/^[-*•]\s+/, ''))}</li>`).join('')
        return `<ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.6;color:#3F5650;">${items}</ul>`
    }
    return emailText(lines.map(inline).join('<br>'))
}

/**
 * The engagement's published update, emailed whole (.claude/plans/publish-and-send-update.md):
 * the sender's note, then every section under its label, then who wrote it. The same text the
 * Overview shows and the PDF prints, so the three never disagree.
 */
export function renderEngagementUpdateEmail(params: EngagementUpdateEmailParams): { subject: string; html: string } {
    const { firmName, engagementName, senderName, summary, byline, note, ctaUrl, copyOf } = params
    const subject = `Update from ${firmName} · ${engagementName}`

    const sections = summary.split(/^## /m)
    const preamble = sections[0].trim()
    const blocks: string[] = []
    if (preamble) blocks.push(...preamble.split(/\n{2,}/).map(proseBlock))
    for (const part of sections.slice(1)) {
        const nl = part.indexOf('\n')
        const heading = (nl === -1 ? part : part.slice(0, nl)).trim()
        const body = nl === -1 ? '' : part.slice(nl + 1).trim()
        if (!body) continue
        blocks.push(`<p style="${SECTION_LABEL}">${escHtml(heading)}</p>`)
        blocks.push(...body.split(/\n{2,}/).map(proseBlock))
    }

    const noteHtml = note?.trim()
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F6F5" style="background-color:#F4F6F5;border-radius:10px;margin:0 0 24px;"><tr><td style="padding:14px 18px;font-size:15px;line-height:1.6;color:#3F5650;">${escHtml(note.trim()).replace(/\n/g, '<br>')}<br><span style="color:#6B7A75;">${escHtml(senderName)}</span></td></tr></table>`
        : ''

    const listed = (copyOf ?? []).length <= 1
        ? (copyOf ?? [])[0] ?? ''
        : `${copyOf!.slice(0, -1).join(', ')} and ${copyOf![copyOf!.length - 1]}`
    const copyHtml = copyOf
        ? `<p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#6B7A75;">Your copy. Sent to ${escHtml(listed)}.</p>`
        : ''

    const body = [
        copyHtml,
        emailHeading(`${engagementName}: an update`),
        noteHtml,
        ...blocks,
        `<p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:#6B7A75;">${escHtml(byline)}</p>`,
        emailText(`<span style="color:#3F5650;">${escHtml(senderName)} · ${escHtml(firmName)}</span>`),
        ctaUrl ? ctaButton('Open the engagement', ctaUrl) : '',
        emailFootnote(ctaUrl
            ? 'Reply in the engagement, so the whole conversation stays in one place.'
            : `${escHtml(senderName)} sent you this from ${escHtml(firmName)}. Reply to this email to reach them.`),
    ].join('\n')

    const firstWords = (note?.trim() || summary.replace(/^##[^\n]*\n/gm, '')).replace(/\s+/g, ' ').trim().slice(0, 120)
    return { subject, html: renderEmail({ title: subject, preheader: firstWords, body }) }
}
