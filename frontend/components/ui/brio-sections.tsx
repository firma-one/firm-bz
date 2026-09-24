import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

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
        <div
            className={cn(
                'text-sm leading-relaxed',
                // Headings read as small section labels rather than titles — the content is the
                // point, the headings just divide it.
                '[&_h2]:text-[11px] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wide',
                '[&_h2]:text-gray-400 [&_h2]:mt-6 [&_h2:first-child]:mt-0 [&_h2]:mb-1.5',
                '[&_p]:mb-0',
                className,
            )}
        >
            <ReactMarkdown>{content}</ReactMarkdown>
        </div>
    )
}
