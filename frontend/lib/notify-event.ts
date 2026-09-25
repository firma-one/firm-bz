import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendPushToUser } from '@/lib/push'

/**
 * Shared dispatch helpers for the per-event notification toggles in Firm Settings
 * (Event Notifications grid). Each event hook calls createEventNotifications and/or
 * sendEventEmail independently, gated by its own FirmEventNotificationConfig flags.
 */

export type EventNotificationRow = {
  firmId: string
  clientId?: string | null
  engagementId?: string | null
  documentId?: string | null
  userId: string
  type: string
  title: string
  body?: string | null
  ctaUrl?: string | null
  metadata?: Record<string, unknown>
  dedupeKey?: string | null
}

/**
 * Creates in-app Notification rows for each recipient, and — for any recipient with a stored
 * push subscription — dispatches a Web Push notification alongside it. Push rides on the same
 * In-App gate from the Event Notifications grid rather than a separate toggle (see plan Part B.2).
 * Never throws — logs and swallows.
 */
export async function createEventNotifications(rows: EventNotificationRow[]): Promise<void> {
  if (rows.length === 0) return
  try {
    await prisma.notification.createMany({
      data: rows.map((row) => ({
        firmId: row.firmId,
        clientId: row.clientId ?? null,
        engagementId: row.engagementId ?? null,
        documentId: row.documentId ?? null,
        userId: row.userId,
        type: row.type,
        priority: 'INFO',
        title: row.title,
        body: row.body ?? null,
        ctaUrl: row.ctaUrl ?? null,
        metadata: (row.metadata ?? {}) as any,
        channels: { inApp: true } as any,
        dedupeKey: row.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    })
  } catch (e) {
    logger.error('createEventNotifications failed', e as Error, 'Notifications', { type: rows[0]?.type })
  }

  await Promise.all(rows.map((row) =>
    sendPushToUser(row.userId, { title: row.title, body: row.body ?? undefined, ctaUrl: row.ctaUrl ?? null })
  ))
}

/** Sends a rendered email to a single user by id. Never throws — logs and swallows. */
export async function sendEventEmailToUser(
  userId: string,
  render: () => { subject: string; html: string }
): Promise<void> {
  try {
    const { createAdminClient } = await import('@/utils/supabase/admin')
    const { sendEmail } = await import('@/lib/email')
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.getUserById(userId)
    const email = data?.user?.email
    if (!email) return
    const { subject, html } = render()
    await sendEmail(email, subject, html)
  } catch (e) {
    logger.error('sendEventEmailToUser failed', e as Error, 'Notifications', { userId })
  }
}

export function buildAbsoluteUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${appUrl}${relativePath}`
}
