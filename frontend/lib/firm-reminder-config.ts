import 'server-only'

import { prisma } from '@/lib/prisma'
import type { FirmEventNotificationConfig, FirmReminderEmailConfig } from '@/lib/actions/firms'

/*
 * A firm's reminder/notification email settings, with defaults filled in. Server-only rather than a
 * server action in lib/actions/firms.ts: it takes any firmId and has no session check, because its
 * callers include crons and billing webhooks that have no session. Route handlers and server modules
 * that have already authorized the request call it directly.
 */

const EVENT_NOTIFICATION_DEFAULTS: FirmEventNotificationConfig = {
    newDocumentIntake: { email: true, inApp: true },
    statusChanged: { email: false, inApp: true },
    documentRejected: { email: true, inApp: true },
    externalClientComment: { email: true, inApp: true },
    engagementInviteAccepted: { email: false, inApp: true },
    deliverableOverdue: { email: true, inApp: true },
    // email defaults true to preserve existing behavior — reminder emails already send.
    reminders: { email: true, inApp: true },
}

export async function getFirmReminderConfig(firmId: string): Promise<FirmReminderEmailConfig & { events: FirmEventNotificationConfig }> {
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
    const raw = (firm?.settings as any)?.reminderEmailConfig ?? {}
    const rawEvents = raw.events ?? {}
    const events = {} as FirmEventNotificationConfig
    for (const key of Object.keys(EVENT_NOTIFICATION_DEFAULTS) as (keyof FirmEventNotificationConfig)[]) {
        const defaults = EVENT_NOTIFICATION_DEFAULTS[key]
        const rawEvent = rawEvents[key] ?? {}
        events[key] = {
            email: rawEvent.email ?? defaults.email,
            inApp: rawEvent.inApp ?? defaults.inApp,
        }
    }
    return {
        immediateOnCreate: raw.immediateOnCreate ?? true,
        recurring: {
            enabled: raw.recurring?.enabled ?? true,
            frequencyDays: raw.recurring?.frequencyDays ?? 1,
            startDaysBeforeDue: raw.recurring?.startDaysBeforeDue ?? 7,
        },
        mentionEmailOnCreate: raw.mentionEmailOnCreate ?? true,
        events,
    }
}
