import type { ReactNode } from 'react'
import { cn, formatFullDate } from '@/lib/utils'
import { ASSISTANT } from '@/lib/ai/assistant'

/**
 * Who wrote a piece of Brio's work, in plain muted text under it
 * (.claude/plans/app-design-refinements.md, sections 4 and 7):
 *
 *   ai + publisher      Written by Brio · reviewed and published by {name} · {date}
 *   ai, no publisher    Written by Brio · {date}   (older records, and the firm brief, which has no review)
 *   manual + publisher  Edited by {name} · {date}
 *   manual, no name     Edited · {date}   (never credits Brio for text a person wrote)
 *
 * Plain text on purpose: the <Brio> mark brands Brio's own surfaces, not a credit line. Everyone who
 * can see the content sees the name, clients included (decision D).
 */
export function BrioByline({
    source = 'ai',
    publisherName,
    date,
    className,
    children,
}: {
    source?: 'ai' | 'manual'
    publisherName?: string | null
    date?: Date | string | null
    className?: string
    /** Trailing text after the byline, e.g. what the brief was written from. */
    children?: ReactNode
}) {
    const when = date ? formatFullDate(date) : ''
    const name = publisherName ? <span className="text-fg">{publisherName}</span> : null
    const credit =
        source === 'manual' ? (
            name ? <>Edited by {name}</> : <>Edited</>
        ) : name ? (
            <>
                Written by {ASSISTANT.name} · reviewed and published by {name}
            </>
        ) : (
            <>Written by {ASSISTANT.name}</>
        )

    return (
        <p className={cn('text-small text-fg-muted', className)}>
            {credit}
            {when && <> · {when}</>}
            {children && <> {children}</>}
        </p>
    )
}
