'use client'

import { useMemo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Hint } from '@/components/ui/tooltip'
import type { ChatSourceItem } from '@/lib/ai/engagement-chat'

/** The hash the engagement workspace routes to the Files tab and opens (engagement-workspace.tsx). */
const DOC_FILE_HASH = '#doc-file:'

/**
 * Turns each doc ID the answer cited into a Markdown link to the item, so it renders as a chip.
 *
 * Only ids in `sources` are linked: the server resolved those within this engagement, so a made-up
 * or foreign id stays plain text. The answer's "(QSR-49)" loses its brackets, since the chip is the
 * citation; "(QSR-49, in Internal)" keeps them around the rest. Code spans are left alone.
 */
export function linkDocIds(markdown: string, sources: readonly ChatSourceItem[] | undefined): string {
    if (!sources?.length) return markdown
    const byDocId = new Map(sources.map((s) => [s.docId, s]))
    const ids = Array.from(byDocId.keys())
        .sort((a, b) => b.length - a.length)
        .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(`(?<![\\w\\[-])(${ids.join('|')})(?![\\w\\]-])`, 'g')

    // Odd segments are inside backticks: code, left verbatim.
    return markdown
        .split(/(`[^`]*`)/)
        .map((segment, i) => {
            if (i % 2 === 1) return segment
            const linked = segment.replace(pattern, (id) => `[${id}](${DOC_FILE_HASH}${byDocId.get(id)!.documentId})`)
            // "([QSR-49](#…))" → " [QSR-49](#…)": the chip replaces the brackets.
            return linked.replace(/\(\s*(\[[^\]]+\]\(#doc-file:[\w-]+\))\s*\)/g, '$1')
        })
        .join('')
}

/** A cited document: its doc ID as a small chip that opens it, with its name on hover. */
function DocChip({ item, children }: { item: ChatSourceItem; children: ReactNode }) {
    const Icon = item.isFolder ? Folder : FileText
    return (
        <Hint label={<>Open &ldquo;{item.name}&rdquo; in Files</>}>
            <a
                href={`${DOC_FILE_HASH}${item.documentId}`}
                className="mx-px inline-flex items-center gap-1 rounded-control bg-surface-muted px-1.5 py-px align-baseline font-mono text-[11px] font-medium text-fg-muted no-underline transition-colors hover:bg-surface-selected hover:text-fg"
            >
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                {children}
            </a>
        </Hint>
    )
}

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
 *
 * `sources` (the documents the answer cited, from the chat route) turns doc IDs into chips that
 * open the item — see `linkDocIds`.
 */
export function ChatMarkdown({ content, className, sources }: { content: string; className?: string; sources?: readonly ChatSourceItem[] }) {
    const markdown = useMemo(() => linkDocIds(content, sources), [content, sources])
    const byDocumentId = useMemo(() => new Map((sources ?? []).map((s) => [s.documentId, s])), [sources])

    return (
        <div
            className={cn(
                'text-sm leading-relaxed',
                // Wrap long unbreakable tokens rather than overflowing the column.
                //
                // Answers name files, and a filename is one word to the line breaker:
                // `01_ICP_Firmographics_&_Persona_Data.xlsx` has no break opportunity in it. Any
                // column narrower than the longest name would otherwise push text past its edge,
                // where the panel clips it. `break-words` only breaks tokens that do not fit, so
                // ordinary prose still wraps between words.
                'break-words',
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
                '[&_li]:my-0.5 [&_li]:marker:text-fg-subtle',
                // A "loose" list (a blank line between items, which the model often writes) wraps
                // each item in a <p>; without this every item carried a paragraph's margins.
                '[&_li>p]:my-0',
                '[&_h2]:text-caption [&_h2]:font-semibold [&_h2]:text-fg-subtle [&_h2]:mt-4 [&_h2]:mb-1',
                '[&_h3]:text-small [&_h3]:font-semibold [&_h3]:text-fg [&_h3]:mt-3 [&_h3]:mb-1',
                '[&_strong]:font-semibold [&_strong]:text-fg',
                '[&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px]',
                // Tables scroll rather than squeeze: the panel is 23rem wide, and a table forced to
                // fit would wrap every cell to one character per line.
                '[&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto',
                '[&_table]:border-collapse [&_table]:text-xs',
                '[&_th]:border-b [&_th]:border-line [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
                '[&_th]:font-medium [&_th]:text-fg-muted [&_th]:whitespace-nowrap',
                '[&_td]:border-b [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
                // Numbers line up when they are in a column together.
                '[&_td]:tabular-nums',
                className,
            )}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ href, children }) => {
                        const item = href?.startsWith(DOC_FILE_HASH) ? byDocumentId.get(href.slice(DOC_FILE_HASH.length)) : undefined
                        if (item) return <DocChip item={item}>{children}</DocChip>
                        // Anything else the model wrote as a link opens in a new tab, never in place
                        // of the page the panel is floating over.
                        return (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-action underline underline-offset-2">
                                {children}
                            </a>
                        )
                    },
                }}
            >
                {markdown}
            </ReactMarkdown>
        </div>
    )
}
