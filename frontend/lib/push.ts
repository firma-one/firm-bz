import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export type StoredPushSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  createdAt: string
}

let vapidConfigured = false
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:no-reply@firmaone.com'
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

/**
 * Sends a push notification to every device/browser subscription stored for a user,
 * pruning any subscription the push service reports as gone (404/410).
 * Never throws — logs and swallows, matching the other event-dispatch helpers.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body?: string; ctaUrl?: string | null; tag?: string }
): Promise<void> {
  if (!ensureVapidConfigured()) return

  try {
    const personalization = await prisma.userPersonalization.findUnique({
      where: { userId },
      select: { pushSubscriptions: true },
    })
    const subscriptions: StoredPushSubscription[] = Array.isArray(personalization?.pushSubscriptions)
      ? (personalization!.pushSubscriptions as unknown as StoredPushSubscription[])
      : []
    if (subscriptions.length === 0) return

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      ctaUrl: payload.ctaUrl ?? '/',
      tag: payload.tag,
    })

    const staleEndpoints: string[] = []
    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        )
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          staleEndpoints.push(sub.endpoint)
        } else {
          logger.error('sendPushToUser: push send failed', e as Error, 'Notifications', { userId, endpoint: sub.endpoint })
        }
      }
    }))

    if (staleEndpoints.length > 0) {
      const remaining = subscriptions.filter((s) => !staleEndpoints.includes(s.endpoint))
      await prisma.userPersonalization.update({
        where: { userId },
        data: { pushSubscriptions: remaining as any },
      })
    }
  } catch (e) {
    logger.error('sendPushToUser failed', e as Error, 'Notifications', { userId })
  }
}
