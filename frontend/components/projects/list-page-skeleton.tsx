'use client'

import { usePathname } from 'next/navigation'
import { LoadingAnnouncement, ShimmerBar, ShimmerBlock } from '@/components/ui/shimmer'
import { EngagementPageLoading } from './engagement-page-loading'

const ENGAGEMENT_PATH = /\/c\/[^/]+\/e\/[^/]+/

/**
 * Loading state for the firm, client-list and client routes (their loading.tsx). These boundaries
 * also catch a navigation INTO an engagement from outside it (Home, a client page, the sidebar), so
 * engagement URLs get the engagement's own loading state — header and tabs, skeleton body — rather
 * than a list skeleton. Everything else gets a page heading and table rows, matching the new pages.
 */
export function ListPageSkeleton() {
    const pathname = usePathname() ?? ''
    if (ENGAGEMENT_PATH.test(pathname)) return <EngagementPageLoading />

    return (
        <div className="flex h-full flex-col" aria-busy="true">
            <LoadingAnnouncement label="Loading" />
            <div className="flex flex-col gap-2 pb-6" aria-hidden>
                <ShimmerBar className="h-7 w-56" />
                <ShimmerBar className="w-80 max-w-full" />
            </div>
            <div className="border-t border-line" aria-hidden>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex h-9 items-center gap-3 border-b border-line px-1">
                        <ShimmerBlock className="h-5 w-5" />
                        <ShimmerBar className="w-[34%]" />
                        <ShimmerBar className="ml-auto w-16" />
                        <ShimmerBar className="w-20" />
                    </div>
                ))}
            </div>
        </div>
    )
}
