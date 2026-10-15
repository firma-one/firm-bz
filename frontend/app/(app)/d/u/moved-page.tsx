'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

/**
 * A personal page whose content now lives in the cross-firm Home or Inbox
 * (.claude/plans/cross-firm-home-inbox.md): Recent and Bookmarks → `/d/u/home`, Reminders and
 * Notifications → `/d/u/inbox`. next.config.js redirects these URLs on the server, so this only
 * runs if that is bypassed (e.g. a dev server started before the redirects were added). The old
 * page content passed as children no longer renders; it goes in the Phase 7 cleanup.
 */
export function MovedPage({ to }: { to: 'home' | 'reminders' | 'notifications'; children?: ReactNode }) {
    const router = useRouter()
    const target = to === 'home' ? '/d/u/home' : `/d/u/inbox?tab=${to}`

    useEffect(() => {
        router.replace(target)
    }, [target, router])

    return (
        <div className="flex items-center justify-center gap-2 py-24 text-small text-fg-muted" role="status">
            <LoadingSpinner size="sm" />
            {to === 'home' ? 'Opening Home…' : 'Opening your Inbox…'}
        </div>
    )
}
