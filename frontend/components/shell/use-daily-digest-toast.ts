"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { checkDailyReminderDigest } from "@/lib/actions/user-reminders"
import { useToast } from "@/components/ui/toast"

/**
 * The legacy RemindersPanel opens itself once per local day when reminders are due (the in-app
 * catch-up for the push digest). The New UI has no panel, so it shows a toast pointing at the
 * Inbox instead — same once-per-day claim, so the user is still told exactly once.
 */
export function useDailyDigestToast() {
    const { addToast } = useToast()
    const router = useRouter()
    useEffect(() => {
        let cancelled = false
        void checkDailyReminderDigest()
            .then((r) => {
                if (cancelled || !r.notify) return
                addToast({
                    type: r.overdue > 0 ? "warning" : "info",
                    title: r.count === 1 ? "1 reminder needs you today" : `${r.count} reminders need you today`,
                    message: r.overdue > 0 ? `${r.overdue} overdue.` : "They're waiting in your Inbox.",
                    // The way there, rather than words pointing at the sidebar (Deepak, 2026-11-19).
                    action: { label: "Open Inbox", onClick: () => router.push("/d/u/inbox") },
                    duration: 10_000,
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
