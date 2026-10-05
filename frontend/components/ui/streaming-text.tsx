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
 *
 * The animation itself is blur-and-fade only, with no translate: a rise would need
 * `display:inline-block` on every word, which takes each one out of normal inline flow and makes a
 * narrow column visibly rewrap on each token. See `.t-stream-word` in globals.css.
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

    // The final token is still being appended character by character, so it re-renders on every
    // chunk. Animating it would restart its fade each time and read as a flicker on the word being
    // typed. It is rendered plain and animates once the next whitespace pushes it into the settled
    // set — which is the moment it stops changing.
    const lastWordIndex = tokens.reduce(
        (last, tok, i) => (/^\s+$/.test(tok) ? last : i),
        -1,
    )

    return (
        <span className={className}>
            {tokens.map((tok, i) => {
                if (/^\s+$/.test(tok)) return tok
                if (i === lastWordIndex) return <span key={i}>{tok}</span>
                return (
                    <span key={i} className="t-stream-word">
                        {tok}
                    </span>
                )
            })}
        </span>
    )
}
