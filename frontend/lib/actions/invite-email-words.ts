/**
 * What an inviter reads when an invitation's email couldn't be sent. Shared by the firm, client and
 * engagement invites, so the three say the same thing. The mail server's own words stay in the log:
 * they're SMTP codes, not reasons a person can act on.
 *
 * - `saved`: a first invite. The invitation stands (its row reads Email failed), so this is a warning.
 * - `resend`: a resend, whose only job was the email, so this is the error.
 * - `added`: someone with an account was added straight away; only the notice didn't reach them.
 */
export function inviteEmailFailed(email: string, kind: 'saved' | 'resend' | 'added', name?: string): string {
    if (kind === 'added') return `Added ${name || email}, but couldn't email them. Let them know yourself.`
    if (kind === 'resend') return `Couldn't email ${email}. The invitation is still open, so try again in a moment.`
    return `Invitation saved, but the email to ${email} wasn't sent. Use Resend to try again.`
}
