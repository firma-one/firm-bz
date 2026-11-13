import { renderEmail, ctaButton, detailCard, emailFootnote, emailHeading, emailText, escHtml } from './base'

/** To System Admins: a Group admin asked for a custom domain. */
export function renderDomainRequestedEmail(p: { host: string; kindLabel: string; groupName: string; plan: string | null; reviewUrl: string }): { subject: string; html: string } {
    const subject = `Custom domain request · ${p.host}`
    const body = [
        emailHeading('A workspace asked for a custom domain'),
        detailCard({ label: p.kindLabel, title: p.host, lines: [`${p.groupName}${p.plan ? ` · ${p.plan}` : ''}`] }),
        emailText('Set it up on Vercel, check it answers, then approve it.'),
        ctaButton('Review the request', p.reviewUrl),
    ].join('\n')
    return { subject, html: renderEmail({ title: subject, preheader: `${p.groupName} asked for ${p.host}`, body, footerNote: 'You get this because you are a Firma System Admin.' }) }
}

/** To the Group admin who asked: approved or not. */
export function renderDomainDecisionEmail(p: { host: string; approved: boolean; note: string | null; ctaUrl: string }): { subject: string; html: string } {
    const subject = p.approved ? `${p.host} is live` : `${p.host} wasn't approved`
    const body = [
        emailHeading(subject),
        p.approved
            ? emailText(`Your workspace now opens at <b>${escHtml(p.host)}</b>. Sign-in takes everyone there, and email links point there.`)
            : emailText('You can ask for another name from Billing.'),
        p.note ? detailCard({ label: 'Note from Firma', title: p.note }) : '',
        ctaButton(p.approved ? `Open ${p.host}` : 'Open Billing', p.ctaUrl),
    ].join('\n')
    return { subject, html: renderEmail({ title: subject, preheader: subject, body }) }
}

/** To the Group admin and System Admins: an approved domain stopped answering. */
export function renderDomainUnreachableEmail(p: { host: string; reason: string; ctaUrl: string }): { subject: string; html: string } {
    const subject = `${p.host} can't be reached`
    const body = [
        emailHeading(subject),
        detailCard({ label: 'Daily check', title: p.reason }),
        emailText('Until it answers again, sign-in and email links use the main Firma address, so nobody is locked out.'),
        ctaButton('Open Billing', p.ctaUrl),
        emailFootnote('If you changed your DNS records, point the CNAME back to Firma and it recovers on the next check.'),
    ].join('\n')
    return { subject, html: renderEmail({ title: subject, preheader: p.reason, body }) }
}
