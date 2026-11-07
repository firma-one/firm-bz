'use client'

import { Lock } from 'lucide-react'
import { Hint } from '@/components/ui/tooltip'

/**
 * The mark on what's internal only (stored as a `private` lock): Limited Access contributors and Reviewers
 * can't see it, Leads and Full Access contributors still do. Whoever may change it can click it to remove
 * the mark; to anyone else it only says so. Shared by the Files row and /tour's copy of it.
 */
export function PrivateMark({ onMakePublic }: { onMakePublic?: () => void }) {
    return (
        <Hint label={`Internal only. Hidden from Limited Access contributors and Reviewers.${onMakePublic ? ' Click to remove.' : ''}`}>
            {onMakePublic ? (
                <button
                    type="button"
                    aria-label="Internal only. Click to remove"
                    onClick={(e) => {
                        e.stopPropagation()
                        onMakePublic()
                    }}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                >
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                </button>
            ) : (
                <span role="img" aria-label="Internal only" className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-fg-muted">
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                </span>
            )}
        </Hint>
    )
}
