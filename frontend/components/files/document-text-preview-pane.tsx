'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { WrapText, Braces } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PreviewKind } from '@/lib/preview-kinds'
import { detectStructured, formatStructured, looksMinified, type Structured } from '@/lib/text-format'

/** Beyond this the pane shows the head of the file rather than trying to lay out all of it. */
const MAX_CHARS = 2_000_000

interface DocumentTextPreviewPaneProps {
    document: any
    projectId?: string
    kind: Extract<PreviewKind, 'text' | 'markdown' | 'html'>
    onFallback: (reason: string) => void
}

/**
 * Plain text, Markdown and HTML.
 *
 * These were dead ends before: not inline-viewable, and not something either provider
 * converts to PDF, so a .md or .json showed "preview not available" even though the search
 * indexer had already read its contents.
 *
 * HTML is rendered in a sandboxed iframe with no script execution and no same-origin
 * access. Markdown is shown as source for now — the point is legibility, and a renderer is
 * a separate decision.
 */
export function DocumentTextPreviewPane({ document, projectId, kind, onFallback }: DocumentTextPreviewPaneProps) {
    const [text, setText] = useState('')
    const [truncated, setTruncated] = useState(false)
    const [loading, setLoading] = useState(true)
    const [wrap, setWrap] = useState(kind !== 'text')
    /** null until the text arrives and we know whether formatting is worth offering. */
    const [formatted, setFormatted] = useState<boolean | null>(null)

    const effectiveProjectId = projectId ?? document?.projectId
    const documentId = document?.id

    const onFallbackRef = useRef(onFallback)
    useEffect(() => { onFallbackRef.current = onFallback }, [onFallback])

    useEffect(() => {
        if (!effectiveProjectId || !documentId) return
        let cancelled = false

        void (async () => {
            setLoading(true)
            try {
                const res = await fetch(
                    `/api/projects/${effectiveProjectId}/documents/${encodeURIComponent(documentId)}/preview?native=1`
                )
                if (cancelled) return
                if (!res.ok) {
                    onFallbackRef.current(`preview request failed (${res.status})`)
                    return
                }

                const contentType = res.headers.get('Content-Type') ?? ''
                // The adapters convert to PDF when they cannot serve the original, so a PDF
                // coming back means this pane is the wrong one.
                if (contentType.includes('application/pdf')) {
                    onFallbackRef.current('served as a converted PDF')
                    return
                }
                // The route answers with an HTML card when conversion fails. For a file
                // that is not itself HTML, rendering that card would present our own error
                // page as the document's contents.
                if (kind !== 'html' && contentType.includes('text/html')) {
                    onFallbackRef.current('the preview could not be generated')
                    return
                }

                const body = await res.text()
                if (cancelled) return
                const clipped = body.length > MAX_CHARS ? body.slice(0, MAX_CHARS) : body
                setText(clipped)
                setTruncated(body.length > MAX_CHARS)
                // Minified structured text is indented on arrival: one 40,000-character
                // line is not a preview of anything. Already-formatted files are left as
                // the author wrote them.
                setFormatted(looksMinified(clipped) && detectStructured(clipped) !== null)
                setLoading(false)
            } catch (err) {
                if (cancelled) return
                console.error('[text-preview] could not read file', err)
                onFallbackRef.current('file could not be read as text')
            }
        })()

        return () => { cancelled = true }
    }, [effectiveProjectId, documentId])

    const structured = useMemo(() => (text ? detectStructured(text) : null), [text])
    const formattedText = useMemo(
        () => (structured ? formatStructured(text, structured) : null),
        [text, structured],
    )
    const shown = formatted && formattedText ? formattedText : text

    if (loading) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center bg-[#f3f4f6]">
                <LoadingSpinner size="md" />
            </div>
        )
    }

    if (kind === 'html') {
        return (
            <div className="flex-1 min-h-0 flex flex-col bg-white">
                <iframe
                    // No allow-scripts and no allow-same-origin: the document renders, and
                    // can do nothing else. The route sends a matching CSP for direct hits.
                    sandbox=""
                    srcDoc={text}
                    className="flex-1 min-h-0 w-full border-0"
                    title="Preview"
                />
            </div>
        )
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-white">
            <div className="flex shrink-0 items-center justify-end gap-1.5 px-3 py-1.5 border-b border-[#e5e7eb]">
                {truncated && (
                    <span className="mr-auto text-[11px] text-slate-500">
                        Showing the first {(MAX_CHARS / 1_000_000).toFixed(0)}M characters
                    </span>
                )}
                {formattedText && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => setFormatted((f) => !f)}
                                className={`h-6 w-6 rounded inline-flex items-center justify-center hover:bg-slate-100 ${formatted ? 'text-slate-900 bg-slate-100' : 'text-slate-500 hover:text-slate-700'}`}
                                aria-label={formatted ? 'Show the original text' : 'Format and indent'}
                                aria-pressed={Boolean(formatted)}
                            >
                                <Braces className="h-3.5 w-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {formatted
                                ? `Show the original ${structured === 'json' ? 'JSON' : 'XML'}`
                                : 'Format and indent'}
                        </TooltipContent>
                    </Tooltip>
                )}

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => setWrap((w) => !w)}
                            className={`h-6 w-6 rounded inline-flex items-center justify-center hover:bg-slate-100 ${wrap ? 'text-slate-900 bg-slate-100' : 'text-slate-500 hover:text-slate-700'}`}
                            aria-label={wrap ? 'Stop wrapping lines' : 'Wrap long lines'}
                            aria-pressed={wrap}
                        >
                            <WrapText className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                        {wrap ? 'Stop wrapping' : 'Wrap long lines'}
                    </TooltipContent>
                </Tooltip>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
                <pre
                    className={`m-0 p-4 text-[12px] leading-[1.6] font-mono text-slate-800 ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}
                >
                    {shown}
                </pre>
            </div>
        </div>
    )
}
