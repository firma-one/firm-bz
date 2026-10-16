"use client"

import { useEffect } from "react"
import { checkDailyReminderDigest } from "@/lib/actions/user-reminders"
import { useToast } from "@/components/ui/toast"

/**
 * The legacy RemindersPanel opens itself once per local day when reminders are due (the in-app
 * catch-up for the push digest). The New UI has no panel, so it shows a toast pointing at the
 * Inbox instead — same once-per-day claim, so the user is still told exactly once.
 */
export function useDailyDigestToast() {
    const { addToast } = useToast()
    useEffect(() => {
        let cancelled = false
        void checkDailyReminderDigest()
            .then((r) => {
                if (cancelled || !r.notify) return
                addToast({
                    type: r.overdue > 0 ? "warning" : "info",
                    title: r.count === 1 ? "1 reminder needs you today" : `${r.count} reminders need you today`,
                    message: r.overdue > 0 ? `${r.overdue} overdue. Open your Inbox to review them.` : "Open your Inbox to review them.",
                })
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
        // Once per shell mount; the server-side claim makes it once per day.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
}
