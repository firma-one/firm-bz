import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { Brio } from '@/components/ui/brio'
import { ThinkingDots, TypingCaret } from '@/components/brio/brio-typing'

/**
 * Brio's sections: headings read as small section labels rather than titles — the content is the
 * point, the headings just divide it. Shared by the finished and the streaming renderings, so a
 * brief doesn't shift when it finishes.
 */
const SECTIONS_CLASS = cn(
    'text-sm leading-relaxed',
    '[&_h2]:text-[11px] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wide',
    '[&_h2]:text-gray-400 [&_h2]:mt-6 [&_h2:first-child]:mt-0 [&_h2]:mb-1.5',
    '[&_p]:mb-0',
)

/**
 * Renders Brio's sectioned output — the `## Heading` + prose shape shared by the engagement
 * summary and the firm brief.
 *
 * Extracted because both surfaces carried the same heading styles inline and had already
 * drifted apart once: a spacing change had to be made twice, in two different class strings.
 */
export function BrioSections({
    content,
    className = '',
}: {
    content: string
    className?: string
}) {
    return (
        <div className={cn(SECTIONS_CLASS, className)}>
            <ReactMarkdown>{content}</ReactMarkdown>
        </div>
    )
}

/**
 * The same sections while Brio is still writing them, as Brio writes everywhere
 * (components/brio/brio-typing.tsx): headings as labels as soon as their line arrives, prose a whole
 * word at a time, and a thin green caret after the last word. Before the first word, Brio's dots and
 * `placeholder`, which says what Brio is doing. `text` is what is on screen so far: the caller types
 * it out with `useTypedText`.
 */
export function StreamingBrioSections({
    text,
    placeholder,
    className = '',
}: {
    text: string
    placeholder: React.ReactNode
    className?: string
}) {
    const blocks = text.split('\n').filter((l) => l.trim() !== '')
    if (blocks.length === 0) {
        return (
            <div className={cn(SECTIONS_CLASS, className)}>
                <p className="flex items-center gap-2 text-fg-subtle"><ThinkingDots />{placeholder}</p>
            </div>
        )
    }
    return (
        // Busy, not live: announcing every word as it arrives would drown a screen reader. The card
        // announces the start and the end instead.
        <div className={cn(SECTIONS_CLASS, className)} aria-busy="true">
            {blocks.map((line, i) => {
                const last = i === blocks.length - 1
                const heading = line.match(/^#{1,6}\s+(.*)$/)
                return heading
                    ? <h2 key={i}>{heading[1]}{last && <TypingCaret />}</h2>
                    : <p key={i}>{line}{last && <TypingCaret />}</p>
            })}
        </div>
    )
}

/** What Brio is doing before its first word. */
export function BrioReading({ what }: { what: string }) {
    return <><Brio /> is reading {what}…</>
}
