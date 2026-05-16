/**
 * System admin checks based on SYSTEM_ADMIN_EMAILS env var.
 * Parse comma-separated emails, trim spaces, case-insensitive comparison.
 */

function getSystemAdminEmails(): string[] {
  const adminEmailsEnv = process.env.SYSTEM_ADMIN_EMAILS || ''
  if (!adminEmailsEnv) return []

  return adminEmailsEnv
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isSystemAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const adminEmails = getSystemAdminEmails()
  return adminEmails.includes(email.toLowerCase())
}
