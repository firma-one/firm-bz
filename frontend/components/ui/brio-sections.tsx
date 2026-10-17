import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { Brio } from '@/components/ui/brio'
import { StreamingText } from '@/components/ui/streaming-text'

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
 * The same sections while Brio is still writing them: headings as labels as soon as their line
 * arrives, prose fading in word by word (StreamingText), a caret after the last word. Before the
 * first word, `placeholder` says what Brio is doing.
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
    const caret = (
        <span
            aria-hidden
            className="ml-0.5 inline-block h-[1.05em] w-[0.5em] -mb-[0.15em] translate-y-px bg-action align-baseline"
            style={{ animation: 'fm-caret 1.3s ease-in-out infinite' }}
        />
    )
    if (blocks.length === 0) {
        return <div className={cn(SECTIONS_CLASS, className)}><p className="text-fg-subtle">{placeholder}{caret}</p></div>
    }
    return (
        // Busy, not live: announcing every word as it arrives would drown a screen reader. The card
        // announces the start and the end instead.
        <div className={cn(SECTIONS_CLASS, className)} aria-busy="true">
            {blocks.map((line, i) => {
                const last = i === blocks.length - 1
                const heading = line.match(/^#{1,6}\s+(.*)$/)
                return heading
                    ? <h2 key={i}>{heading[1]}{last && caret}</h2>
                    : <p key={i}><StreamingText text={line} />{last && caret}</p>
            })}
        </div>
    )
}

/** What Brio is doing before its first word. */
export function BrioReading({ what }: { what: string }) {
    return <><Brio /> is reading {what}…</>
}
