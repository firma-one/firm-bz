/**
 * What the platform maintenance route says about its emails, for the admin page: "Maintenance
 * warning sent to 40 of 42 people." The admin used to be told nothing, whatever went out.
 */
export function emailNotice(kind: 'warning' | 'complete', emails: { sent: number; total: number } | null | undefined): string | null {
  if (!emails) return null
  const what = kind === 'warning' ? 'Maintenance warning' : '"Maintenance complete" email'
  if (emails.total === 0) return `${what}: nobody to email.`
  return emails.sent === emails.total
    ? `${what} sent to ${emails.total === 1 ? '1 person' : `all ${emails.total} people`}.`
    : `${what} sent to ${emails.sent} of ${emails.total} people. The rest didn't go out; the server log names them.`
}
