import { Sparkles } from 'lucide-react'
import { BRIO_GREEN } from '@/lib/ai/assistant'
import { cn } from '@/lib/utils'

/**
 * Brio's sparkle while Brio is still at work on it (Deepak, 2026-11-18): the same green sparkle,
 * ringed by a turning arc, in the place the sparkle sits. Closing the review pane leaves the work
 * running; this is how the heading says so, and clicking it opens the pane to watch.
 */
export function BrioWorkingSparkle({ className }: { className?: string }) {
    return (
        <span className={cn('relative inline-flex h-5 w-5 items-center justify-center', className)} aria-hidden>
            <svg viewBox="0 0 20 20" className="absolute inset-0 h-5 w-5 animate-spin motion-reduce:animate-none [animation-duration:1.1s]">
                <circle cx="10" cy="10" r="8.5" fill="none" stroke={BRIO_GREEN} strokeOpacity="0.18" strokeWidth="1.5" />
                <circle cx="10" cy="10" r="8.5" fill="none" stroke={BRIO_GREEN} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="14 40" />
            </svg>
            <Sparkles className="h-3 w-3" style={{ color: BRIO_GREEN }} />
        </span>
    )
}
