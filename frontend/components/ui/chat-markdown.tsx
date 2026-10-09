import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/**
 * Assistant replies, rendered as Markdown.
 *
 * ## Why the answer carries its own formatting
 *
 * Structured output used to mean a purpose-built card: the file review rendered its counts into a
 * bespoke stats panel that no other answer could use, and a second kind of structure would have
 * needed a second panel. That is a specialised renderer per narrow case, and it makes the panel a
 * dashboard rather than a conversation.
 *
 * A table in the reply works for every answer, now and later, and reads the way any modern chat
 * does. The assistant decides how to present its own output; this just renders it.
 *
 * GFM is enabled for tables — the one construct the default parser omits and the main reason this
 * exists.
 */
export function ChatMarkdown({ content, className }: { content: string; className?: string }) {
    return (
        <div
            className={cn(
                'text-sm leading-relaxed',
                // Prose is capped at a readable measure while TABLES are not.
                //
                // The panel is resizable, and widening it is usually for a table that does not fit
                // — not for longer lines of text. Past roughly 75 characters a line the eye loses
                // its place returning to the next one, so the text keeps its column and only the
                // things that genuinely need the width take it.
                '[&>p]:max-w-[38rem] [&>ul]:max-w-[38rem] [&>ol]:max-w-[38rem]',
                '[&>h2]:max-w-[38rem] [&>h3]:max-w-[38rem]',
                // Tight vertical rhythm: chat bubbles are small, and prose spacing built for a page
                // leaves a two-line answer floating in its own margins.
                '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                '[&_p]:my-2',
                '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4',
                '[&_li]:my-0.5 [&_li]:marker:text-gray-400',
                '[&_h2]:text-[11px] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wide',
                '[&_h2]:text-gray-400 [&_h2]:mt-4 [&_h2]:mb-1',
                '[&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-gray-700 [&_h3]:mt-3 [&_h3]:mb-1',
                '[&_strong]:font-semibold [&_strong]:text-gray-900',
                '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px]',
                // Tables scroll rather than squeeze: the panel is 23rem wide, and a table forced to
                // fit would wrap every cell to one character per line.
                '[&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto',
                '[&_table]:border-collapse [&_table]:text-xs',
                '[&_th]:border-b [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
                '[&_th]:font-medium [&_th]:text-gray-500 [&_th]:whitespace-nowrap',
                '[&_td]:border-b [&_td]:border-gray-100 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
                // Numbers line up when they are in a column together.
                '[&_td]:tabular-nums',
                className,
            )}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
    )
}
