import { cn } from '@/lib/utils'
import { Brio } from '@/components/ui/brio'

/**
 * The caption above text Brio drafted for a person to send: "Brio draft · edit before sending".
 *
 * One component so every draft surface (status update, reply, nudge) says the same thing about who
 * wrote it and that nothing has gone anywhere yet. `children` replaces the trailing words where a
 * surface has more to say ("drafted this from the thread. Internal notes are never used.").
 */
export function BrioDraftLabel({
    htmlFor,
    className,
    children,
}: {
    /** The textarea it labels, when it is the label. */
    htmlFor?: string
    className?: string
    children?: React.ReactNode
}) {
    const content = (
        <>
            <Brio className="text-action" />
            <span>{children ?? 'draft · edit before sending'}</span>
        </>
    )
    const classes = cn('flex items-center gap-1.5 text-caption text-fg-muted', className)
    return htmlFor ? (
        <label htmlFor={htmlFor} className={classes}>{content}</label>
    ) : (
        <div className={classes}>{content}</div>
    )
}
