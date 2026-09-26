import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ASSISTANT, BRIO_GREEN } from '@/lib/ai/assistant'

/**
 * Brio's branding — the one component for presenting the assistant.
 *
 * Renders the sparkle, the name and the AI subscript. Both variations are opt-outs, so the
 * default is the complete mark and nothing has to be repeated at the call site.
 *
 * Not for attribute strings (aria-label, placeholder, title) or model prompts — those take
 * `ASSISTANT.name` directly, since a React element cannot go in a string and a screen reader
 * should hear "Brio", not "Brio A I".
 */
export function Brio({
    className = '',
    /** Drop the sparkle and render the name alone. */
    noIcon = false,
    /** Pin to firmä green instead of following the surrounding text colour. */
    fixedColor = false,
}: {
    className?: string
    noIcon?: boolean
    fixedColor?: boolean
}) {
    const name = (
        <span>
            {/* Both transforms are pinned: the name stays title case and the subscript stays caps,
                whatever text-transform an ancestor applies. */}
            <span className="font-bold normal-case">{ASSISTANT.name}</span>
            {/* `max()` puts a 9px floor under the em-relative size: at 0.45em the subscript fell
                to ~5px in body text, where two uppercase letters stop resolving. Bolder and at
                full opacity for the same reason — the earlier `opacity-60` compounded it. Scaling
                still takes over above ~16px, so headings keep their proportion. */}
            <sub
                className="relative bottom-0 ml-[0.15em] align-baseline font-bold uppercase tracking-[0.06em] opacity-80"
                style={{ fontSize: 'max(9px, 0.45em)' }}
            >
                AI
            </sub>
        </span>
    )

    if (noIcon) return <span className={className}>{name}</span>

    return (
        <span className={cn('whitespace-nowrap', className)}>
            {/* The sparkle is centred on the name's own line box rather than nudged by a fixed
                offset. A magic `translateY` was tuned against Inter and sat too high in Space
                Grotesk on the landing page, whose cap height differs — this centres correctly in
                any face. `inline-flex` here is safe: the wrapper below keeps the mark on the
                surrounding baseline, and only the icon is centred within it. */}
            <span className="inline-flex h-[1em] w-[0.82em] shrink-0 items-center justify-center align-baseline">
                <Sparkles
                    strokeWidth={2}
                    aria-hidden
                    className="h-[0.82em] w-[0.82em]"
                    style={fixedColor ? { color: BRIO_GREEN } : undefined}
                />
            </span>
            <span className="inline-block w-[0.22em]" aria-hidden />
            {name}
        </span>
    )
}
