'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { setUserTimezone } from '@/lib/actions/user-notification-prefs'

const SESSION_KEY = 'fm-tz-synced'

/**
 * Silently records the browser's IANA timezone against the signed-in user, so the daily
 * reminder digest can fire at their local 09:00 instead of a fixed UTC hour. Renders
 * nothing and never prompts. Runs once per tab session — the server action is also a
 * no-op when the value is unchanged, so a repeat costs one cheap read.
 */
export function TimezoneSync() {
    const { user } = useAuth()

    useEffect(() => {
        if (!user) return
        if (typeof window === 'undefined') return

        try {
            if (sessionStorage.getItem(SESSION_KEY) === user.id) return
        } catch {
            // Private mode / blocked storage — fall through and just sync again.
        }

        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (!timezone) return

        void setUserTimezone(timezone)
            .then(() => {
                try { sessionStorage.setItem(SESSION_KEY, user.id) } catch { /* non-fatal */ }
            })
            .catch(() => {
                // Timezone is an optimisation, not a requirement — digest falls back to UTC.
            })
    }, [user])

    return null
}
