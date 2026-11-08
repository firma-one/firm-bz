'use client'

import { useRouter } from 'next/navigation'
import { LoadFailed } from '@/components/ui/load-failed'

/**
 * What the engagement page shows when looking it up failed on our side (P1-69): a database blip is not
 * "Page not found · you no longer have access". The reason stays generic: the server's own error isn't
 * meant for people. Try again reloads the page's data.
 */
export function EngagementLoadFailed() {
    const router = useRouter()
    return (
        <div className="flex flex-1 items-center justify-center p-6">
            <LoadFailed
                what="this engagement"
                reason="Something went wrong on our side. Try again."
                onRetry={() => router.refresh()}
            />
        </div>
    )
}
