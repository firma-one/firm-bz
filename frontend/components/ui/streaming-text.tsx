'use client'

import { useMemo } from 'react'

/**
 * Renders streamed text so each word resolves through a soft cross-blur as it arrives.
 *
 * Words are keyed by index, so a word already on screen keeps its identity across re-renders and
 * animates exactly once — re-keying on content would restart every animation on every token and
 * make the whole paragraph shimmer.
 *
 * Whitespace is preserved by splitting on a capturing separator and keeping the separators in the
 * token list, so newlines and runs of spaces survive intact.
 */
export function StreamingText({
    text,
    className = '',
    animate = true,
}: {
    text: string
    className?: string
    /** When false, renders plain text — used once a stream has finished. */
    animate?: boolean
}) {
    const tokens = useMemo(() => (animate ? text.split(/(\s+)/) : []), [text, animate])

    if (!animate) return <span className={className}>{text}</span>

    return (
        <span className={className}>
            {tokens.map((tok, i) =>
                /^\s+$/.test(tok)
                    ? tok
                    : (
                        <span key={i} className="t-stream-word">
                            {tok}
                        </span>
                    )
            )}
        </span>
    )
}
