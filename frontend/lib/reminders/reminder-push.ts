import { sendPushToUser } from '@/lib/push'
import { getFirmReminderConfig } from '@/lib/actions/firms'
import { logger } from '@/lib/logger'

/**
 * Whether a firm has reminder notifications switched on. Push rides the In-App flag from
 * the Firm Settings Event Notifications grid, matching the convention in lib/notify-event.ts
 * — there is no separate push column.
 *
 * Reminders are user-scoped but the config is firm-scoped, so a reminder whose firm cannot
 * be resolved (a manual self-reminder on a deleted entity) is allowed through rather than
 * silently dropped.
 */
export async function remindersPushEnabled(firmId: string | null | undefined): Promise<boolean> {
    if (!firmId) return true
    try {
        const config = await getFirmReminderConfig(firmId)
        return config.events.reminders.inApp !== false
    } catch (e) {
        logger.error('remindersPushEnabled lookup failed', e as Error, 'Reminders', { firmId })
        return true
    }
}

/**
 * Sends a reminder as a Web Push notification, gated on the owning firm's config.
 * `tag` replaces rather than stacks a repeat for the same reminder in the OS tray.
 * Never throws — push is best-effort alongside the email/in-app paths.
 */
export async function sendReminderPush(params: {
    userId: string
    firmId?: string | null
    title: string
    body?: string
    ctaUrl?: string | null
    tag?: string
}): Promise<void> {
    try {
        if (!(await remindersPushEnabled(params.firmId))) return
        await sendPushToUser(params.userId, {
            title: params.title,
            body: params.body,
            ctaUrl: params.ctaUrl ?? null,
            tag: params.tag,
        })
    } catch (e) {
        logger.error('sendReminderPush failed', e as Error, 'Reminders', { userId: params.userId })
    }
}
