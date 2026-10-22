'use client'

import { InboxView, type InboxSource } from '@/components/inbox/inbox-view'
import { DEMO_HOME_FIRM, demoNotifications, demoReminders, demoWork } from '@/lib/demo/demo-personal-data'

const noop = async () => {}

/**
 * The demo user's reminders and notifications, built when the Inbox loads (in the browser, so due
 * dates count from the viewer's today). Done, Dismiss, Hide and Mark all read change only the list
 * on screen; nothing is sent anywhere.
 */
const DEMO_SOURCE: InboxSource = {
    load: async () => {
        const now = new Date()
        return { reminders: demoReminders(now), notifications: demoNotifications(now), needsYou: demoWork(now).needsYou }
    },
    markRead: noop,
    dismiss: noop,
    markDone: noop,
    hide: noop,
    markAllRead: noop,
}

/** The app's Inbox (components/inbox/inbox-view.tsx) over the demo user's sample data. */
export function DemoInbox() {
    return <InboxView firms={[{ id: DEMO_HOME_FIRM.id, slug: DEMO_HOME_FIRM.slug, name: DEMO_HOME_FIRM.name }]} source={DEMO_SOURCE} />
}
